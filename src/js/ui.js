// UI rendering and events module
import { State, saveSettings } from './state.js';
import { Currency, fmtDual, updateCurrencyDisplay } from './currency.js';
import { T, switchLanguage } from './i18n.js';
import { initGrid, updateGridConfig, quickPick, clearSelection, clearPinned, clearPreferred, clearExcluded, addTicket, clearQueue, getNextTicket, highlightMatches, pulseCurrentTicket } from './ticket.js';
import { initCharts, updateCharts } from './charts.js';
import { initLogs, renderLogs, addLogEntry } from './logs.js';
import { exportCSV } from './csv.js';

let worker = null; // Now managed by controller.js
let statusUpdateTimer = null;
let lastStatsUpdate = 0;

// Initialize UI
function initUI() {
  // Setup diagnostics if not already set
  window.diag = window.diag || ((label, data) => {
    console.log('%c[UI]', 'color:#6EA9FF', label, data || '');
  });
  
  window.diag('init-ui-start');
  
  setupControls();
  setupSettings();
  setupTicketBuilder();
  setupCurrencyModal();
  setupTheme();
  setupI18n();
  initWorker();
  
  // Initialize components - wait a bit for DOM to be fully ready
  setTimeout(() => {
    const gridEl = document.getElementById('number-grid');
    if (gridEl) {
      initGrid(gridEl);
      window.diag('grid-initialized');
    } else {
      console.error('Number grid element not found');
    }
    initCharts();
    initLogs();
    initPrizeMapEditor();
    
    // Update from state
    updateUIFromState();
    
    window.diag('init-ui-complete');
  }, 100);
  
  // Worker is managed by controller.js
  // Visibility change is handled by controller.js
  
  // Ticket queue change handler
  document.addEventListener('ticketQueueChanged', async (e) => {
    // Worker is managed by controller.js
    try {
      const { worker } = await import('./controller.js');
      if (worker) {
        worker.postMessage({ t: 'queue', data: e.detail.queue });
      }
    } catch (err) {
      console.error('Failed to send queue to worker:', err);
    }
  });
}

// Setup controls - buttons are now bound in controller.js
function setupControls() {
  // stop-on-jackpot is still managed here
  document.getElementById('stop-on-jackpot')?.addEventListener('change', (e) => {
    State.settings.cfg.stopOnJackpot = e.target.checked;
    // Worker is managed by controller
    const controllerWorker = window.worker || worker;
    if (controllerWorker) {
      controllerWorker.postMessage({ t: 'cfg', stopOnJackpot: e.target.checked });
    }
    saveSettings();
  });
}

// Setup settings
function setupSettings() {
  // Resource knobs
  document.getElementById('batch-size')?.addEventListener('input', (e) => {
    const val = Math.min(Math.max(200, parseInt(e.target.value) || 200), 10000);
    State.settings.pricing.batchSize = val;
    e.target.value = val;
    saveSettings();
  });
  
  document.getElementById('ui-delay')?.addEventListener('input', (e) => {
    State.settings.pricing.uiDelay = parseInt(e.target.value) || 200;
    saveSettings();
  });
  
  document.getElementById('max-log-rows')?.addEventListener('input', (e) => {
    State.settings.perf.logCap = parseInt(e.target.value) || 50000;
    saveSettings();
  });
  
  document.getElementById('chart-cap')?.addEventListener('input', (e) => {
    State.settings.perf.chartCap = parseInt(e.target.value) || 2000;
    saveSettings();
  });
  
  document.getElementById('eco-mode')?.addEventListener('change', (e) => {
    State.settings.eco.enabled = e.target.checked;
    const row = document.getElementById('eco-rate-row');
    if (row) row.style.display = e.target.checked ? 'block' : 'none';
    saveSettings();
  });
  
  document.getElementById('eco-rate-cap')?.addEventListener('input', (e) => {
    State.settings.eco.rateCap = parseInt(e.target.value) || 500;
    saveSettings();
  });
  
  // Run limit
  document.getElementById('limit-kind')?.addEventListener('change', (e) => {
    State.settings.cfg.limit.kind = e.target.value;
    saveSettings();
  });
  
  document.getElementById('limit-value')?.addEventListener('input', (e) => {
    State.settings.cfg.limit.value = parseInt(e.target.value) || 0;
    saveSettings();
  });
  
  // Game settings
  document.getElementById('game-preset')?.addEventListener('change', (e) => {
    applyPreset(e.target.value);
  });
  
  document.getElementById('max-main')?.addEventListener('input', (e) => {
    State.settings.game.maxMain = parseInt(e.target.value) || 49;
    updateGridConfig(State.settings.game.maxMain, State.settings.game.mainCount);
    saveSettings();
  });
  
  document.getElementById('main-count')?.addEventListener('input', (e) => {
    State.settings.game.mainCount = parseInt(e.target.value) || 6;
    updateGridConfig(State.settings.game.maxMain, State.settings.game.mainCount);
    saveSettings();
    
    // Trigger prize map update
    const event = new CustomEvent('gameSettingsChanged');
    document.dispatchEvent(event);
  });
  
  document.getElementById('has-bonus')?.addEventListener('change', (e) => {
    State.settings.game.hasBonus = e.target.checked;
    const row = document.getElementById('max-bonus-row');
    if (row) row.style.display = e.target.checked ? 'block' : 'none';
    saveSettings();
  });
  
  document.getElementById('max-bonus')?.addEventListener('input', (e) => {
    State.settings.game.maxBonus = parseInt(e.target.value) || 10;
    saveSettings();
  });
  
  document.getElementById('ticket-price')?.addEventListener('input', (e) => {
    State.settings.pricing.ticketPrice = parseFloat(e.target.value) || 2.0;
    saveSettings();
  });
  
  document.getElementById('tickets-per-day')?.addEventListener('input', (e) => {
    State.settings.pricing.ticketsPerDay = parseInt(e.target.value) || 0;
    saveSettings();
  });
  
  document.getElementById('total-tickets')?.addEventListener('input', (e) => {
    State.settings.pricing.totalTickets = parseInt(e.target.value) || 0;
    saveSettings();
  });
  
  // Prize map
  document.getElementById('btn-parse-prize')?.addEventListener('click', parsePrizeMap);
  document.getElementById('btn-sync-prize')?.addEventListener('click', () => {
    saveSettings();
    showToast('Prize map synced', 'success');
  });
}

// Setup ticket builder
function setupTicketBuilder() {
  // Debounce helper
  const debounce = (fn, delay = 300) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  };
  
  // Guarded handler wrapper
  const guardHandler = (fn) => {
    return (...args) => {
      try {
        fn(...args);
      } catch (e) {
        console.error('Handler error:', e);
        showToast('An error occurred', 'error');
      }
    };
  };
  
  document.getElementById('btn-quick-pick')?.addEventListener('click', guardHandler(quickPick));
  document.getElementById('btn-clear')?.addEventListener('click', guardHandler(clearSelection));
  document.getElementById('btn-clear-pinned')?.addEventListener('click', guardHandler(clearPinned));
  document.getElementById('btn-clear-preferred')?.addEventListener('click', guardHandler(clearPreferred));
  document.getElementById('btn-clear-excluded')?.addEventListener('click', guardHandler(clearExcluded));
  document.getElementById('btn-add-ticket')?.addEventListener('click', guardHandler(addTicket));
  document.getElementById('btn-clear-queue')?.addEventListener('click', guardHandler(clearQueue));
  
  // Range selector
  document.getElementById('btn-add-range')?.addEventListener('click', guardHandler(addRange));
  document.getElementById('btn-generate-range')?.addEventListener('click', guardHandler(generateRangeTickets));
  
  // Log row hover
  document.addEventListener('logRowHover', (e) => {
    const { row } = e.detail;
    if (row.ticket) {
      highlightMatches(row.ticket);
    }
  });
}

// Setup currency modal
function setupCurrencyModal() {
  const modal = document.getElementById('currency-modal');
  const btn = document.getElementById('btn-currency');
  const saveBtn = document.getElementById('btn-currency-save');
  const cancelBtn = document.getElementById('btn-currency-cancel');
  
  btn?.addEventListener('click', () => {
    modal?.classList.add('active');
    loadCurrencyToModal();
  });
  
  saveBtn?.addEventListener('click', () => {
    saveCurrencyFromModal();
    modal?.classList.remove('active');
    updateCurrencyDisplay();
    updateKPIs();
  });
  
  cancelBtn?.addEventListener('click', () => {
    modal?.classList.remove('active');
  });
}

// Setup theme - now handled by controller.js
function setupTheme() {
  const select = document.getElementById('theme-select');
  const saved = localStorage.getItem('lsim.theme') || 'dark';
  if (select) select.value = saved;
  // Theme is set by controller.js bindings
}

// Setup i18n - now handled by controller.js
function setupI18n() {
  const select = document.getElementById('lang-select');
  const saved = localStorage.getItem('lsim.locale') || 'fa';
  if (select) select.value = saved;
  // Language is set by controller.js bindings
}

// Apply preset
function applyPreset(preset) {
  if (preset === 'classic6') {
    State.settings.game = { maxMain: 49, mainCount: 6, hasBonus: true, maxBonus: 10 };
    State.settings.prizeMap = '6,1=JACKPOT\n6,0=1000000\n5,1=100000\n5,0=10000\n4,1=1000\n4,0=100\n3,1=50\n3,0=10\n2,1=5';
  } else if (preset === 'mini5') {
    State.settings.game = { maxMain: 35, mainCount: 5, hasBonus: false, maxBonus: 0 };
    State.settings.prizeMap = '5=JACKPOT\n4=100000\n3=5000\n2=100';
  } else if (preset === 'custom') {
    // Keep current settings
    return;
  }
  
  // Update UI
  const maxMainInput = document.getElementById('max-main');
  const mainCountInput = document.getElementById('main-count');
  const hasBonusInput = document.getElementById('has-bonus');
  const maxBonusInput = document.getElementById('max-bonus');
  const prizeMapText = document.getElementById('prize-map-text');
  const maxBonusRow = document.getElementById('max-bonus-row');
  
  if (maxMainInput) maxMainInput.value = State.settings.game.maxMain;
  if (mainCountInput) mainCountInput.value = State.settings.game.mainCount;
  if (hasBonusInput) hasBonusInput.checked = State.settings.game.hasBonus;
  if (maxBonusInput) maxBonusInput.value = State.settings.game.maxBonus;
  if (prizeMapText) prizeMapText.value = State.settings.prizeMap;
  if (maxBonusRow) maxBonusRow.style.display = State.settings.game.hasBonus ? 'block' : 'none';
  
  updateGridConfig(State.settings.game.maxMain, State.settings.game.mainCount);
  
  // Trigger prize map update
  const event = new CustomEvent('gameSettingsChanged');
  document.dispatchEvent(event);
  
  saveSettings();
}

// Parse prize map
function parsePrizeMap() {
  const text = document.getElementById('prize-map-text')?.value || '';
  const visual = document.getElementById('prize-map-visual');
  
  if (!visual) return;
  
  const lines = text.split('\n').filter(l => l.trim());
  visual.innerHTML = '';
  
  lines.forEach(line => {
    const row = document.createElement('div');
    row.className = 'prize-row';
    row.textContent = line;
    visual.appendChild(row);
  });
  
  State.settings.prizeMap = text;
}

// Load currency to modal
function loadCurrencyToModal() {
  document.getElementById('base-code').value = Currency.base.code;
  document.getElementById('base-sym').value = Currency.base.sym;
  document.getElementById('base-minor').value = Currency.base.minor;
  document.getElementById('sec-code').value = Currency.sec.code;
  document.getElementById('sec-sym').value = Currency.sec.sym;
  document.getElementById('sec-minor').value = Currency.sec.minor;
  document.getElementById('sec-rate').value = Currency.sec.rate;
  document.getElementById('show-both-currency').checked = Currency.showBoth;
}

// Save currency from modal
function saveCurrencyFromModal() {
  Currency.base.code = document.getElementById('base-code').value || 'USD';
  Currency.base.sym = document.getElementById('base-sym').value || '$';
  Currency.base.minor = parseInt(document.getElementById('base-minor').value) || 100;
  Currency.sec.code = document.getElementById('sec-code').value || '';
  Currency.sec.sym = document.getElementById('sec-sym').value || '';
  Currency.sec.minor = parseInt(document.getElementById('sec-minor').value) || 1;
  Currency.sec.rate = parseFloat(document.getElementById('sec-rate').value) || 1.0;
  Currency.showBoth = document.getElementById('show-both-currency').checked;
  
  import('./currency.js').then(m => m.saveCurrency());
}

// Add range
function addRange() {
  const min = parseInt(document.getElementById('range-min')?.value) || 1;
  const max = parseInt(document.getElementById('range-max')?.value) || maxNumber;
  // Range logic would be stored in State.settings.filters
  showToast(`Range ${min}-${max} added`, 'info');
}

// Generate range tickets
function generateRangeTickets() {
  const count = parseInt(document.getElementById('smart-count')?.value) || 10;
  // Generate tickets based on ranges
  showToast(`Generated ${count} tickets`, 'info');
}

// Initialize worker (or use controller's worker)
function initWorker() {
  // Worker is now managed by controller.js
  // Listen to controller events
  document.addEventListener('workerTick', (e) => {
    handleWorkerTick(e.detail);
  });
  
  document.addEventListener('workerReset', (e) => {
    updateKPIs();
    updateCharts(true);
    renderLogs();
  });
  
  document.addEventListener('statsReset', () => {
    updateKPIs();
    updateCharts(true);
    renderLogs();
  });
}

// Handle worker tick
function handleWorkerTick(data) {
  const { rows, stats: workerStats, delta } = data;
  
  // Update stats from worker
  Object.assign(State.stats, workerStats);
  
  // Process rows synchronously
  rows.forEach(row => {
    // Add to purchase log
    import('./state.js').then(m => m.addPurchaseLog(row));
    addLogEntry(row);
    
    // Update day result
    if (row.day === State.stats.days) {
      State.dayResult = {
        matches: row.matches,
        bonus: row.bonus,
        prize: row.prize
      };
    }
  });
  
  // Update UI
  updateKPIs();
  updateStatus();
  updateCharts();
  updateDayResult();
  
  // Pulse current ticket (last one in batch)
  if (rows.length > 0 && rows[rows.length - 1].ticket) {
    State.currentTicket = rows[rows.length - 1].ticket;
    pulseCurrentTicket(State.currentTicket);
    
    // Highlight matches if any
    const lastRow = rows[rows.length - 1];
    if (lastRow.matches > 0) {
      setTimeout(() => {
        highlightMatches(rows[rows.length - 1].ticket);
      }, 100);
    }
  }
  
  // Start status update timer if not running
  const currentRunState = window.runState || State.runState || 'idle';
  if (!statusUpdateTimer && currentRunState === 'running') {
    statusUpdateTimer = setInterval(() => {
      updateStatus();
    }, 1000);
  }
}

// Update run state
function updateRunState(data) {
  const { running, paused } = data;
  
  State.runState = running ? (paused ? 'paused' : 'running') : 'idle';
  
  const startBtn = document.getElementById('btn-start');
  const pauseBtn = document.getElementById('btn-pause');
  const stopBtn = document.getElementById('btn-stop');
  const statusChip = document.getElementById('status-chip');
  
  if (startBtn) startBtn.disabled = running && !paused;
  if (pauseBtn) pauseBtn.disabled = !running || paused;
  if (stopBtn) stopBtn.disabled = !running;
  
  if (statusChip) {
    statusChip.textContent = T(`status${State.runState.charAt(0).toUpperCase() + State.runState.slice(1)}`);
    statusChip.className = `status-chip ${State.runState}`;
  }
  
  // Clear status timer if stopped
  if (!running && statusUpdateTimer) {
    clearInterval(statusUpdateTimer);
    statusUpdateTimer = null;
  }
}

// These handlers are now in controller.js - kept for compatibility
// Functions removed - all handled by controller.js bindings

// Generate daily target
function generateDailyTarget() {
  const max = State.settings.game.maxMain;
  const count = State.settings.game.mainCount;
  const numbers = [];
  for (let i = 1; i <= max; i++) numbers.push(i);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return numbers.slice(0, count).sort((a, b) => a - b);
}

// Get random int
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Update KPIs
function updateKPIs() {
  const { stats } = State;
  
  // Calculate net and ROI
  stats.net = stats.paid - stats.spent;
  stats.roi = stats.spent > 0 ? ((stats.paid - stats.spent) / stats.spent * 100) : 0;
  
  const ticketsEl = document.getElementById('kpi-tickets');
  if (ticketsEl) ticketsEl.textContent = stats.tickets.toLocaleString();
  
  const daysEl = document.getElementById('kpi-days');
  if (daysEl) daysEl.textContent = stats.days.toLocaleString();
  
  const jackpotsEl = document.getElementById('kpi-jackpots');
  if (jackpotsEl) jackpotsEl.textContent = stats.jackpots.toLocaleString();
  
  const spentEl = document.getElementById('kpi-spent');
  if (spentEl) spentEl.textContent = fmtDual(stats.spent);
  
  const paidEl = document.getElementById('kpi-paid');
  if (paidEl) paidEl.textContent = fmtDual(stats.paid);
  
  const netEl = document.getElementById('kpi-net');
  if (netEl) {
    netEl.textContent = fmtDual(stats.net);
    netEl.className = `kpi-value ${stats.net >= 0 ? 'positive' : 'negative'}`;
  }
  
  const roiEl = document.getElementById('kpi-roi');
  if (roiEl) {
    roiEl.textContent = `${stats.roi.toFixed(2)}%`;
    roiEl.className = `kpi-value ${stats.roi >= 0 ? 'positive' : 'negative'}`;
  }
}

// Update status
function updateStatus() {
  const rateEl = document.getElementById('rate-display');
  const elapsedEl = document.getElementById('elapsed-display');
  
  if (rateEl) {
    rateEl.innerHTML = `${State.stats.rate.toFixed(1)} <span data-i18n="ticketsSec">${T('ticketsSec')}</span>`;
  }
  
  if (elapsedEl) {
    const secs = Math.floor(State.stats.elapsed);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const str = `${String(hours).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    elapsedEl.textContent = str;
  }
}

// Update day result
function updateDayResult() {
  const el = document.getElementById('day-result');
  if (!el || !State.dayResult) return;
  
  const { matches, bonus, prize } = State.dayResult;
  if (matches === 0 && prize === 0) {
    el.textContent = '';
    return;
  }
  
  el.textContent = `Day ${State.stats.days}: ${matches} matches${bonus ? ' + bonus' : ''} - ${fmtDual(prize)}`;
}

// Update UI from state
function updateUIFromState() {
  // Load all settings into UI
  const s = State.settings;
  
  document.getElementById('batch-size').value = s.pricing.batchSize;
  document.getElementById('ui-delay').value = s.pricing.uiDelay;
  document.getElementById('max-log-rows').value = s.perf.logCap;
  document.getElementById('chart-cap').value = s.perf.chartCap;
  document.getElementById('eco-mode').checked = s.eco.enabled;
  document.getElementById('eco-rate-cap').value = s.eco.rateCap;
  document.getElementById('stop-on-jackpot').checked = s.cfg.stopOnJackpot;
  document.getElementById('limit-kind').value = s.cfg.limit.kind;
  document.getElementById('limit-value').value = s.cfg.limit.value;
  document.getElementById('max-main').value = s.game.maxMain;
  document.getElementById('main-count').value = s.game.mainCount;
  document.getElementById('has-bonus').checked = s.game.hasBonus;
  document.getElementById('max-bonus').value = s.game.maxBonus;
  document.getElementById('ticket-price').value = s.pricing.ticketPrice;
  document.getElementById('tickets-per-day').value = s.pricing.ticketsPerDay;
  document.getElementById('total-tickets').value = s.pricing.totalTickets;
  document.getElementById('prize-map-text').value = s.prizeMap;
  
  updateGridConfig(s.game.maxMain, s.game.mainCount);
  updateKPIs();
}

// Show toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Listen for toast events
document.addEventListener('showToast', (e) => {
  showToast(e.detail.message, e.detail.type);
});

// Listen for currency changes
document.addEventListener('currencyChanged', () => {
  updateKPIs();
  renderLogs();
});

export { initUI, showToast };

