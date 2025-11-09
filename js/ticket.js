// Ticket builder module - Pinned/Preferred/Excluded model
import { State } from './state.js';
import { T } from './i18n.js';

let numberGridEl = null;
let maxNumber = 49;
let mainCount = 6;
let currentMode = 'select'; // 'select', 'pin', 'prefer', 'exclude'

// Initialize number grid
function initGrid(container) {
  numberGridEl = container;
  setupModeSelector();
  renderGrid();
  updateCounters();
}

// Setup mode selector
function setupModeSelector() {
  const setupHandlers = () => {
    const buttons = document.querySelectorAll('.tool-toggle, .segmented-btn');
    if (buttons.length === 0) {
      console.warn('No tool toggle buttons found');
      return;
    }
    
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
          document.querySelectorAll('.tool-toggle, .segmented-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentMode = btn.dataset.mode || 'select';
          
          window.diag && window.diag('mode-changed', currentMode);
        } catch (err) {
          console.error('Mode selector error:', err);
        }
      });
    });
    
    window.diag && window.diag('mode-selector-setup', buttons.length);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupHandlers);
  } else {
    setTimeout(setupHandlers, 0);
  }
}

// Render number grid
function renderGrid() {
  if (!numberGridEl) return;
  
  numberGridEl.innerHTML = '';
  
  for (let i = 1; i <= maxNumber; i++) {
    const cell = document.createElement('div');
    cell.className = 'number-cell';
    cell.dataset.number = i;
    cell.textContent = i;
    
    // Apply state classes
    if (State.pinnedNumbers.has(i)) {
      cell.classList.add('pinned');
    } else if (State.preferredNumbers.has(i)) {
      cell.classList.add('preferred');
    } else if (State.excludedNumbers.has(i)) {
      cell.classList.add('excluded');
    }
    
    if (State.selectedNumbers.includes(i)) {
      cell.classList.add('selected');
    }
    
    cell.addEventListener('click', () => handleCellClick(i, cell));
    
    numberGridEl.appendChild(cell);
  }
  
  updateCounters();
}

// Handle cell click based on current mode
function handleCellClick(num) {
  try {
    const wasSelected = State.selectedNumbers.includes(num);
    const wasPinned = State.pinnedNumbers.has(num);
    const wasPreferred = State.preferredNumbers.has(num);
    const wasExcluded = State.excludedNumbers.has(num);
    const totalSelected = State.selectedNumbers.length + State.pinnedNumbers.size;
    
    if (currentMode === 'select') {
      if (wasSelected) {
        State.selectedNumbers = State.selectedNumbers.filter(n => n !== num);
      } else {
        if (totalSelected >= mainCount) {
          const message = T ? (T('selectLimitWarning') || '') : '';
          showToast(message || `حداکثر ${mainCount} عدد`, 'warn');
          return;
        }
        State.selectedNumbers.push(num);
        State.selectedNumbers.sort((a, b) => a - b);
      }
    } else if (currentMode === 'pin') {
      if (wasPinned) {
        State.pinnedNumbers.delete(num);
      } else {
        if (State.pinnedNumbers.size >= mainCount) {
          const message = T ? (T('pinLimitWarning') || '') : '';
          showToast(message || `بیش از ${mainCount} عدد نمی‌توان قفل کرد`, 'warn');
          return;
        }
        State.selectedNumbers = State.selectedNumbers.filter(n => n !== num);
        State.preferredNumbers.delete(num);
        State.excludedNumbers.delete(num);
        State.pinnedNumbers.add(num);
      }
    } else if (currentMode === 'prefer') {
      if (wasPreferred) {
        State.preferredNumbers.delete(num);
      } else {
        State.selectedNumbers = State.selectedNumbers.filter(n => n !== num);
        State.excludedNumbers.delete(num);
        State.preferredNumbers.add(num);
      }
    } else if (currentMode === 'exclude') {
      if (wasExcluded) {
        State.excludedNumbers.delete(num);
      } else {
        State.selectedNumbers = State.selectedNumbers.filter(n => n !== num);
        State.pinnedNumbers.delete(num);
        State.preferredNumbers.delete(num);
        State.excludedNumbers.add(num);
      }
    }
    
    renderGrid();
    updateAddTicketButton();
    notifySelectionChange();
  } catch (e) {
    console.error('Cell click error:', e);
  }
}

// Update grid configuration
function updateGridConfig(max, count) {
  maxNumber = max;
  mainCount = count;
  
  // Update pinned max counter
  const pinnedMaxEl = document.getElementById('pinned-max');
  if (pinnedMaxEl) pinnedMaxEl.textContent = count;
  
  // Remove out-of-range numbers from all sets
  State.selectedNumbers = State.selectedNumbers.filter(n => n <= max);
  State.pinnedNumbers.forEach(n => { if (n > max) State.pinnedNumbers.delete(n); });
  State.preferredNumbers.forEach(n => { if (n > max) State.preferredNumbers.delete(n); });
  State.excludedNumbers.forEach(n => { if (n > max) State.excludedNumbers.delete(n); });
  
  // Enforce pin limit
  if (State.pinnedNumbers.size > mainCount) {
    const excess = Array.from(State.pinnedNumbers).slice(mainCount);
    excess.forEach(n => State.pinnedNumbers.delete(n));
  }
  
  renderGrid();
  updateAddTicketButton();
  notifySelectionChange();
}

// Update counters
function updateCounters() {
  const pinnedCounter = document.getElementById('pinned-counter');
  const preferredCounter = document.getElementById('preferred-counter');
  const excludedCounter = document.getElementById('excluded-counter');
  
  if (pinnedCounter) {
    pinnedCounter.innerHTML = `پین: ${State.pinnedNumbers.size}/<span id="pinned-max">${mainCount}</span>`;
  }
  if (preferredCounter) {
    preferredCounter.textContent = `ترجیح: ${State.preferredNumbers.size}`;
  }
  if (excludedCounter) {
    excludedCounter.textContent = `حذف: ${State.excludedNumbers.size}`;
  }
}

function notifySelectionChange() {
  const event = new CustomEvent('ticketSelectionChanged', {
    detail: {
      selected: [...State.selectedNumbers],
      pinned: Array.from(State.pinnedNumbers),
      preferred: Array.from(State.preferredNumbers),
      excluded: Array.from(State.excludedNumbers)
    }
  });
  document.dispatchEvent(event);
}

// Quick pick - respects Pinned/Preferred/Excluded
function quickPick() {
  try {
    const generated = generateTicketFromState();
    const pins = new Set(State.pinnedNumbers);
    State.selectedNumbers = generated.main.filter(n => !pins.has(n)).slice(0, Math.max(0, mainCount - pins.size));
    renderGrid();
    updateAddTicketButton();
    notifySelectionChange();
  } catch (e) {
    console.error('Quick pick error:', e);
    showToast('Quick pick failed', 'error');
  }
}

function resetGrid() {
  State.selectedNumbers = [];
  State.pinnedNumbers.clear();
  State.preferredNumbers.clear();
  State.excludedNumbers.clear();
  renderGrid();
  updateAddTicketButton();
  notifySelectionChange();
}

function applyFilter(type) {
  const predicates = {
    even: (n) => n % 2 === 0,
    odd: (n) => n % 2 === 1,
    prime: (n) => isPrime(n),
    low: (n) => n <= Math.floor(maxNumber / 2),
    high: (n) => n > Math.floor(maxNumber / 2)
  };
  const predicate = predicates[type];
  if (!predicate) return;
  for (let i = 1; i <= maxNumber; i++) {
    if (!predicate(i)) {
      State.selectedNumbers = State.selectedNumbers.filter(n => n !== i);
      State.pinnedNumbers.delete(i);
      State.preferredNumbers.delete(i);
      State.excludedNumbers.add(i);
    }
  }
  renderGrid();
  updateAddTicketButton();
  notifySelectionChange();
}

// Clear selection
function clearSelection() {
  State.selectedNumbers = [];
  renderGrid();
  updateAddTicketButton();
  notifySelectionChange();
}

// Clear pinned
function clearPinned() {
  State.pinnedNumbers.clear();
  renderGrid();
  updateAddTicketButton();
  notifySelectionChange();
}

// Clear preferred
function clearPreferred() {
  State.preferredNumbers.clear();
  renderGrid();
  updateAddTicketButton();
  notifySelectionChange();
}

// Clear excluded
function clearExcluded() {
  State.excludedNumbers.clear();
  renderGrid();
  updateAddTicketButton();
  notifySelectionChange();
}

// Add ticket to queue
function addTicket() {
  const ticketNumbers = getManualTicketNumbers();
  if (ticketNumbers.length !== mainCount) {
    showToast(T ? (T('selectLimitWarning') || '') : 'انتخاب کامل نیست', 'warn');
    return;
  }
  
  const ticket = {
    main: ticketNumbers,
    bonus: null
  };
  State.ticketQueue.push(ticket);
  
  State.selectedNumbers = [];
  // Keep pinned selections so user can reuse them
  
  renderGrid();
  updateAddTicketButton();
  renderQueue();
  notifySelectionChange();
  
  // Notify worker
  const event = new CustomEvent('ticketQueueChanged', { detail: { queue: State.ticketQueue } });
  document.dispatchEvent(event);
}

// Clear queue
function clearQueue() {
  State.ticketQueue = [];
  renderQueue();
  notifySelectionChange();
  
  // Notify worker
  const event = new CustomEvent('ticketQueueChanged', { detail: { queue: [] } });
  document.dispatchEvent(event);
}

// Remove ticket from queue
function removeTicket(index) {
  State.ticketQueue.splice(index, 1);
  renderQueue();
  
  // Notify worker
  const event = new CustomEvent('ticketQueueChanged', { detail: { queue: State.ticketQueue } });
  document.dispatchEvent(event);
}

// Render queue chips
function renderQueue() {
  const container = document.getElementById('queue-chips');
  if (!container) return;
  
  container.innerHTML = '';
  
  State.ticketQueue.forEach((ticket, idx) => {
    const normalized = normalizeTicket(ticket);
    const chip = document.createElement('div');
    chip.className = 'queue-chip';
    const mainLabel = normalized.main.length ? normalized.main.join('-') : '--';
    const bonusLabel = Number.isFinite(normalized.bonus) ? ` + ${normalized.bonus}` : '';
    chip.textContent = `#${idx + 1} [${mainLabel}${bonusLabel}]`;
    
    const remove = document.createElement('span');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => removeTicket(idx));
    
    chip.appendChild(remove);
    container.appendChild(chip);
  });
}

// Update add ticket button
function updateAddTicketButton() {
  const btn = document.getElementById('btn-add-ticket');
  if (btn) {
    const total = State.selectedNumbers.length + State.pinnedNumbers.size;
    btn.disabled = total !== mainCount;
  }
}

// Highlight matched numbers
function highlightMatches(ticket) {
  if (!numberGridEl) return;
  
  const normalized = normalizeTicket(ticket);
  
  numberGridEl.querySelectorAll('.number-cell').forEach(cell => {
    cell.classList.remove('matched');
  });
  
  normalized.main.forEach(num => {
    const cell = numberGridEl.querySelector(`[data-number="${num}"]`);
    if (cell) {
      cell.classList.add('matched');
      setTimeout(() => cell.classList.remove('matched'), 2000);
    }
  });
}

// Pulse current ticket
function pulseCurrentTicket(ticket) {
  if (!numberGridEl) return;
  
  const normalized = normalizeTicket(ticket);
  
  normalized.main.forEach(num => {
    const cell = numberGridEl.querySelector(`[data-number="${num}"]`);
    if (cell) {
      cell.classList.add('current');
      setTimeout(() => cell.classList.remove('current'), 1500);
    }
  });
}

// Get next ticket from queue or generate (respecting Pinned/Preferred/Excluded)
function getNextTicket() {
  if (State.ticketQueue.length > 0) {
    return normalizeTicket(State.ticketQueue.shift());
  }
  
  return generateTicketFromState();
}

// Show toast helper
function showToast(message, type = 'info') {
  const event = new CustomEvent('showToast', { detail: { message, type } });
  document.dispatchEvent(event);
}

function isPrime(num) {
  if (num < 2) return false;
  for (let i = 2; i * i <= num; i++) {
    if (num % i === 0) return false;
  }
  return true;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateTicketFromState() {
  const ticket = new Set();
  State.pinnedNumbers.forEach((n) => ticket.add(n));
  if (ticket.size > mainCount) {
    return {
      main: Array.from(ticket).slice(0, mainCount).sort((a, b) => a - b),
      bonus: null
    };
  }
  const preferredPool = shuffle(
    Array.from(State.preferredNumbers).filter((n) => !ticket.has(n) && !State.excludedNumbers.has(n))
  );
  preferredPool.forEach((n) => {
    if (ticket.size < mainCount) ticket.add(n);
  });
  if (ticket.size < mainCount) {
    const allowed = [];
    for (let i = 1; i <= maxNumber; i++) {
      if (ticket.has(i)) continue;
      if (State.pinnedNumbers.has(i)) continue;
      if (State.preferredNumbers.has(i)) continue;
      if (State.excludedNumbers.has(i)) continue;
      allowed.push(i);
    }
    shuffle(allowed).forEach((n) => {
      if (ticket.size < mainCount) ticket.add(n);
    });
  }
  return {
    main: Array.from(ticket).slice(0, mainCount).sort((a, b) => a - b),
    bonus: null
  };
}

function addRandomTicketsToQueue(count = 1) {
  const safe = Math.max(1, Math.min(500, Number.parseInt(count, 10) || 1));
  for (let i = 0; i < safe; i++) {
    State.ticketQueue.push(generateTicketFromState());
  }
  renderQueue();
  const event = new CustomEvent('ticketQueueChanged', { detail: { queue: State.ticketQueue } });
  document.dispatchEvent(event);
  const message = T ? (T('queueRandomSuccess') || 'Random tickets added to queue') : 'Random tickets added to queue';
  showToast(message, 'success');
}

function normalizeTicket(entry) {
  if (Array.isArray(entry)) {
    return { main: [...entry], bonus: null };
  }
  if (entry && Array.isArray(entry.main)) {
    return {
      main: [...entry.main],
      bonus: Number.isFinite(entry.bonus) ? entry.bonus : null
    };
  }
  return { main: [], bonus: null };
}

function getManualTicketNumbers() {
  const combined = new Set(State.pinnedNumbers);
  State.selectedNumbers.forEach((n) => combined.add(n));
  return Array.from(combined).sort((a, b) => a - b).slice(0, mainCount);
}

export {
  initGrid,
  updateGridConfig,
  quickPick,
  resetGrid,
  applyFilter,
  clearSelection,
  clearPinned,
  clearPreferred,
  clearExcluded,
  addTicket,
  addRandomTicketsToQueue,
  clearQueue,
  renderQueue,
  highlightMatches,
  pulseCurrentTicket,
  getNextTicket
};
