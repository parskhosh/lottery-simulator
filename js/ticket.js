// Ticket builder module - Pinned/Preferred/Excluded model
import { State } from './state.js';

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
    const buttons = document.querySelectorAll('.segmented-btn');
    if (buttons.length === 0) {
      console.warn('No segmented buttons found');
      return;
    }
    
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
          document.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
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
function handleCellClick(num, cell) {
  try {
    // Remove from all sets first (exclusivity)
    State.pinnedNumbers.delete(num);
    State.preferredNumbers.delete(num);
    State.excludedNumbers.delete(num);
    State.selectedNumbers = State.selectedNumbers.filter(n => n !== num);
    
    cell.classList.remove('pinned', 'preferred', 'excluded', 'selected');
    
    if (currentMode === 'select') {
      // Toggle selection
      if (State.selectedNumbers.length < mainCount) {
        State.selectedNumbers.push(num);
        cell.classList.add('selected');
      }
    } else if (currentMode === 'pin') {
      // Check pin limit
      if (State.pinnedNumbers.size >= mainCount) {
        showToast(`Cannot pin more than ${mainCount} numbers`, 'error');
        return;
      }
      State.pinnedNumbers.add(num);
      cell.classList.add('pinned');
    } else if (currentMode === 'prefer') {
      State.preferredNumbers.add(num);
      cell.classList.add('preferred');
    } else if (currentMode === 'exclude') {
      State.excludedNumbers.add(num);
      cell.classList.add('excluded');
    }
    
    renderGrid();
    updateAddTicketButton();
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

// Quick pick - respects Pinned/Preferred/Excluded
function quickPick() {
  try {
    // Start with Pinned
    const ticket = [...State.pinnedNumbers];
    
    // Fill from Preferred uniformly
    const preferred = Array.from(State.preferredNumbers);
    if (preferred.length > 0) {
      // Shuffle preferred
      for (let i = preferred.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [preferred[i], preferred[j]] = [preferred[j], preferred[i]];
      }
      
      const needed = mainCount - ticket.length;
      ticket.push(...preferred.slice(0, needed));
    }
    
    // Fill remaining from Allowed Others
    if (ticket.length < mainCount) {
      const allowed = [];
      for (let i = 1; i <= maxNumber; i++) {
        if (!State.pinnedNumbers.has(i) && 
            !State.preferredNumbers.has(i) && 
            !State.excludedNumbers.has(i) &&
            !ticket.includes(i)) {
          allowed.push(i);
        }
      }
      
      // Shuffle allowed
      for (let i = allowed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allowed[i], allowed[j]] = [allowed[j], allowed[i]];
      }
      
      const needed = mainCount - ticket.length;
      ticket.push(...allowed.slice(0, needed));
    }
    
    // Sort and set as selection
    State.selectedNumbers = ticket.sort((a, b) => a - b);
    
    renderGrid();
    updateAddTicketButton();
  } catch (e) {
    console.error('Quick pick error:', e);
    showToast('Quick pick failed', 'error');
  }
}

// Clear selection
function clearSelection() {
  State.selectedNumbers = [];
  renderGrid();
  updateAddTicketButton();
}

// Clear pinned
function clearPinned() {
  State.pinnedNumbers.clear();
  renderGrid();
  updateAddTicketButton();
}

// Clear preferred
function clearPreferred() {
  State.preferredNumbers.clear();
  renderGrid();
  updateAddTicketButton();
}

// Clear excluded
function clearExcluded() {
  State.excludedNumbers.clear();
  renderGrid();
  updateAddTicketButton();
}

// Add ticket to queue
function addTicket() {
  if (State.selectedNumbers.length !== mainCount) return;
  
  const ticket = [...State.selectedNumbers].sort((a, b) => a - b);
  State.ticketQueue.push(ticket);
  
  State.selectedNumbers = [];
  
  renderGrid();
  updateAddTicketButton();
  renderQueue();
  
  // Notify worker
  const event = new CustomEvent('ticketQueueChanged', { detail: { queue: State.ticketQueue } });
  document.dispatchEvent(event);
}

// Clear queue
function clearQueue() {
  State.ticketQueue = [];
  renderQueue();
  
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
    const chip = document.createElement('div');
    chip.className = 'queue-chip';
    chip.textContent = `#${idx + 1} [${ticket.join('-')}]`;
    
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
    btn.disabled = State.selectedNumbers.length !== mainCount;
  }
}

// Highlight matched numbers
function highlightMatches(numbers) {
  if (!numberGridEl) return;
  
  // Clear previous matches
  numberGridEl.querySelectorAll('.number-cell').forEach(cell => {
    cell.classList.remove('matched');
  });
  
  // Highlight matched
  numbers.forEach(num => {
    const cell = numberGridEl.querySelector(`[data-number="${num}"]`);
    if (cell) {
      cell.classList.add('matched');
      setTimeout(() => cell.classList.remove('matched'), 2000);
    }
  });
}

// Pulse current ticket
function pulseCurrentTicket(numbers) {
  if (!numberGridEl) return;
  
  numbers.forEach(num => {
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
    return [...State.ticketQueue.shift()];
  }
  
  // Generate respecting constraints
  const ticket = [];
  
  // Start with Pinned
  ticket.push(...State.pinnedNumbers);
  
  // Fill from Preferred
  if (ticket.length < mainCount) {
    const preferred = Array.from(State.preferredNumbers);
    // Shuffle
    for (let i = preferred.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [preferred[i], preferred[j]] = [preferred[j], preferred[i]];
    }
    const needed = mainCount - ticket.length;
    ticket.push(...preferred.slice(0, needed));
  }
  
  // Fill from allowed
  if (ticket.length < mainCount) {
    const allowed = [];
    for (let i = 1; i <= maxNumber; i++) {
      if (!State.pinnedNumbers.has(i) && 
          !State.preferredNumbers.has(i) && 
          !State.excludedNumbers.has(i) &&
          !ticket.includes(i)) {
        allowed.push(i);
      }
    }
    
    // Shuffle
    for (let i = allowed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allowed[i], allowed[j]] = [allowed[j], allowed[i]];
    }
    
    const needed = mainCount - ticket.length;
    ticket.push(...allowed.slice(0, needed));
  }
  
  return ticket.sort((a, b) => a - b);
}

// Show toast helper
function showToast(message, type = 'info') {
  const event = new CustomEvent('showToast', { detail: { message, type } });
  document.dispatchEvent(event);
}

export {
  initGrid,
  updateGridConfig,
  quickPick,
  clearSelection,
  clearPinned,
  clearPreferred,
  clearExcluded,
  addTicket,
  clearQueue,
  renderQueue,
  highlightMatches,
  pulseCurrentTicket,
  getNextTicket
};
