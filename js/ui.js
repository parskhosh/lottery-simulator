// UI rendering and events module
import { State, saveSettings, GAME_PRESETS, applyGamePreset } from './state.js';
import { Currency, fmtDual, updateCurrencyDisplay } from './currency.js';
import { T, switchLanguage } from './i18n.js';
import { initGrid, updateGridConfig, quickPick, resetGrid, applyFilter, addTicket, addRandomTicketsToQueue, clearQueue, getNextTicket, highlightMatches, pulseCurrentTicket } from './ticket.js';
import { initCharts, updateCharts } from './charts.js';
import { initLogs, renderLogs, addLogEntry } from './logs.js';
import { initPrizeMapEditor, updatePrizeMapUI } from './prize-map-editor.js';
import { exportCSV } from './csv.js';

let worker = null; // Now managed by controller.js
let statusUpdateTimer = null;
let lastStatsUpdate = 0;
let smoothedRate = 0;

// Initialize UI
function initUI() {
  // Setup diagnostics if not already set
  window.diag = window.diag || ((label, data) => {
    console.log('%c[UI]', 'color:#6EA9FF', label, data || '');
  });
  
  window.diag('init-ui-start');
  
  setupControls();
  setupSettings();
  setupResultControls();
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

  document.addEventListener('ticketSelectionChanged', (e) => {
    const currentRunState = State.runState || window.runState || 'idle';
    if (currentRunState === 'running') return;
    const selected = e.detail?.selected || [];
    renderCurrentTicket(selected);
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
      controllerWorker.postMessage({ t: 'cfg', data: { stopOnJackpot: e.target.checked } });
    }
    saveSettings();
  });
}

function setupResultControls() {
  const buttons = document.querySelectorAll('[data-result-mode]');
  if (buttons.length === 0) return;
  enforceFixedResultBounds();
  syncFixedInputs();
  updateResultModeUI();
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.resultMode;
      const isVariable = mode === 'variable';
      State.settings.target = State.settings.target || {};
      State.settings.target.dailyRandom = isVariable;
      saveSettings();
      updateResultModeUI();
    });
  });
  const mainInput = document.getElementById('fixed-main-input');
  const bonusInput = document.getElementById('fixed-bonus-input');
  let timer = null;
  mainInput?.addEventListener('input', (e) => {
    clearTimeout(timer);
    const value = e.target.value;
    timer = setTimeout(() => persistFixedMainInput(value), 250);
  });
  bonusInput?.addEventListener('input', (e) => {
    persistFixedBonusInput(e.target.value);
  });
}

function renderCurrentTicket(ticket = []) {
  const container = document.getElementById('current-ticket');
  if (!container) return;

  const mainCount = State?.settings?.game?.mainCount || 0;
  const hasBonus = !!State?.settings?.game?.hasBonus;
  const fallbackMain = Array.from(new Set([
    ...Array.from(State?.pinnedNumbers || []),
    ...Array.from(State?.selectedNumbers || [])
  ]));
  const normalized = normalizeTicketPayload(ticket);
  const source = normalized.main.length > 0 ? normalized.main : fallbackMain;
  const sorted = [...source].sort((a, b) => a - b);
  const frag = document.createDocumentFragment();

  const createBall = (value, opts = {}) => {
    const span = document.createElement('span');
    span.className = 'draw-ball';
    if (opts.bonus) span.classList.add('bonus');
    if (opts.placeholder) span.classList.add('placeholder');

    const display = opts.placeholder || typeof value !== 'number'
      ? '--'
      : String(value).padStart(2, '0');
    span.textContent = display;
    return span;
  };

  if (mainCount === 0 && !hasBonus) {
    for (let i = 0; i < 6; i++) {
      frag.appendChild(createBall(undefined, { placeholder: true }));
    }
  } else {
    for (let i = 0; i < mainCount; i++) {
      const value = sorted[i];
      const placeholder = typeof value !== 'number' || Number.isNaN(value);
      frag.appendChild(createBall(value, { placeholder }));
    }

    if (hasBonus) {
      const plus = document.createElement('span');
      plus.className = 'draw-split';
      plus.textContent = '+';
      frag.appendChild(plus);

      const bonusValue = Number.isFinite(normalized.bonus) ? normalized.bonus : sorted[mainCount];
      const bonusPlaceholder = typeof bonusValue !== 'number' || Number.isNaN(bonusValue);
      frag.appendChild(createBall(bonusValue, { bonus: true, placeholder: bonusPlaceholder }));
    }
  }

  container.innerHTML = '';
  container.appendChild(frag);

  const hasNumbers = sorted.length > 0;
  container.classList.toggle('is-placeholder', !hasNumbers);
  if (hasNumbers) {
    container.classList.add('is-updated');
    setTimeout(() => container.classList.remove('is-updated'), 650);
  }
}

function normalizeTicketPayload(payload) {
  if (!payload) return { main: [], bonus: null };
  if (Array.isArray(payload)) return { main: [...payload], bonus: null };
  if (payload && Array.isArray(payload.main)) {
    return {
      main: [...payload.main],
      bonus: Number.isFinite(payload.bonus) ? payload.bonus : null
    };
  }
  if (payload && Array.isArray(payload.selected)) {
    return { main: [...payload.selected], bonus: null };
  }
  return { main: [], bonus: null };
}

function renderPresetOptions() {
  const select = document.getElementById('game-preset');
  if (!select) return;
  
  const currentValue = State.settings.preset || 'custom';
  const fragment = document.createDocumentFragment();
  
  Object.entries(GAME_PRESETS).forEach(([key, preset]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = T(preset.labelKey) || preset.labelKey;
    fragment.appendChild(option);
  });
  
  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = T('custom') || 'Custom';
  fragment.appendChild(customOption);
  
  select.innerHTML = '';
  select.appendChild(fragment);
  
  if (select.querySelector(`option[value="${currentValue}"]`)) {
    select.value = currentValue;
  } else {
    select.value = 'custom';
  }
}

function markCustomPreset() {
  if (State.settings.preset !== 'custom') {
    State.settings.preset = 'custom';
    renderPresetOptions();
  } else {
    const select = document.getElementById('game-preset');
    if (select && select.value !== 'custom') {
      select.value = 'custom';
    }
  }
}

// Setup settings
function setupSettings() {
  renderPresetOptions();
  
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
  const presetSelect = document.getElementById('game-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      if (value === 'custom') {
        markCustomPreset();
        saveSettings();
        return;
      }
      
      const preset = applyGamePreset(value);
      if (preset) {
        saveSettings();
        renderPresetOptions();
        enforceFixedResultBounds();
        syncFixedInputs();
        updateResultModeUI();
        updateUIFromState();
        const event = new CustomEvent('gameSettingsChanged');
        document.dispatchEvent(event);
      }
    });
  }
  
  document.getElementById('max-main')?.addEventListener('input', (e) => {
    State.settings.game.maxMain = parseInt(e.target.value) || 49;
    updateGridConfig(State.settings.game.maxMain, State.settings.game.mainCount);
    renderCurrentTicket(State.currentTicket);
    markCustomPreset();
    enforceFixedResultBounds();
    syncFixedInputs();
    saveSettings();
  });
  
  document.getElementById('main-count')?.addEventListener('input', (e) => {
    State.settings.game.mainCount = parseInt(e.target.value) || 6;
    updateGridConfig(State.settings.game.maxMain, State.settings.game.mainCount);
    renderCurrentTicket(State.currentTicket);
    markCustomPreset();
    enforceFixedResultBounds();
    syncFixedInputs();
    saveSettings();
    
    // Trigger prize map update
    const event = new CustomEvent('gameSettingsChanged');
    document.dispatchEvent(event);
  });
  
  document.getElementById('has-bonus')?.addEventListener('change', (e) => {
    State.settings.game.hasBonus = e.target.checked;
    const row = document.getElementById('max-bonus-row');
    if (row) row.style.display = e.target.checked ? 'block' : 'none';
    renderCurrentTicket(State.currentTicket);
    markCustomPreset();
    enforceFixedResultBounds();
    syncFixedInputs();
    saveSettings();
  });
  
  document.getElementById('max-bonus')?.addEventListener('input', (e) => {
    State.settings.game.maxBonus = parseInt(e.target.value) || 10;
    markCustomPreset();
    enforceFixedResultBounds();
    syncFixedInputs();
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
  
  document.getElementById('btn-random-pick')?.addEventListener('click', guardHandler(quickPick));
  document.getElementById('btn-reset-grid')?.addEventListener('click', guardHandler(resetGrid));
  document.getElementById('btn-add-ticket')?.addEventListener('click', guardHandler(addTicket));
  document.getElementById('btn-clear-queue')?.addEventListener('click', guardHandler(clearQueue));
  document.getElementById('btn-queue-random')?.addEventListener('click', guardHandler(() => {
    const value = parseInt(document.getElementById('queue-count')?.value, 10) || 1;
    addRandomTicketsToQueue(value);
  }));
  
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', guardHandler(() => {
      applyFilter(chip.dataset.filter);
    }));
  });
  
  // Log row hover
  document.addEventListener('logRowHover', (e) => {
    const { row } = e.detail;
    const ticket = row.ticket || row.main;
    if (ticket) {
      highlightMatches(ticket);
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
  const toggle = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('lsim.theme') || 'dark';
  if (select) select.value = saved;
  if (toggle) toggle.checked = saved === 'light';
  if (toggle && select) {
    toggle.addEventListener('change', () => {
      const value = toggle.checked ? 'light' : 'dark';
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    select.addEventListener('change', () => {
      toggle.checked = select.value === 'light';
    });
  }
}

// Setup i18n - now handled by controller.js
function setupI18n() {
  const select = document.getElementById('lang-select');
  const saved = localStorage.getItem('lsim.locale') || 'fa';
  if (select) select.value = saved;
  // Language is set by controller.js bindings
}

// Parse prize map
function parsePrizeMap() {
  const textarea = document.getElementById('prize-map-text');
  if (!textarea) return;

  State.settings.prizeMap = textarea.value || '';
  markCustomPreset();
  saveSettings();
  updatePrizeMapUI();
  showToast(T('prizeMapSynced') || 'Prize map updated', 'success');
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
    smoothedRate = 0;
    renderCurrentTicket(State.currentTicket || []);
    updateDayResult();
  });
  
  document.addEventListener('statsReset', () => {
    updateKPIs();
    updateCharts(true);
    renderLogs();
    smoothedRate = 0;
    renderCurrentTicket(State.currentTicket || []);
    updateDayResult();
  });
}

// Handle worker tick
function handleWorkerTick(data) {
  const { rows, stats: workerStats, delta } = data;
  
  // Update stats from worker
  Object.assign(State.stats, workerStats);
  smoothedRate = smoothedRate === 0
    ? workerStats.rate
    : (smoothedRate * 0.8) + (workerStats.rate * 0.2);
  State.stats.rate = smoothedRate;
  
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
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    const ticketPayload = lastRow.ticket || lastRow.main || [];
    State.currentTicket = ticketPayload;
    renderCurrentTicket(ticketPayload);
    pulseCurrentTicket(ticketPayload);
    
    if (lastRow.matches > 0) {
      setTimeout(() => {
        highlightMatches(ticketPayload);
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
  if (!el) return;

  const statsDay = State?.stats?.days || 0;
  const result = State?.dayResult;
  if (!result || (statsDay === 0 && result.matches === 0 && result.prize === 0)) {
    const placeholder = T('waitingForResult') || T('logNoResults') || 'در انتظار نتایج...';
    el.innerHTML = `<span class="draw-summary__placeholder">${placeholder}</span>`;
    return;
  }

  const dayLabel = `${T('days') || 'روز'} ${statsDay.toLocaleString()}`;
  const matchesLabel = result.matches > 0
    ? `${result.matches} ${(T('match') || T('matches') || 'تطابق')}`
    : (T('logResultLoss') || 'بدون برد');
  const prizeLabel = fmtDual(result.prize);
  const parts = [
    `<span class="draw-summary__label">${dayLabel}</span>`,
    `<span class="draw-summary__value">${matchesLabel}</span>`
  ];

  if (result.bonus) {
    parts.push(`<span class="draw-summary__badge">+ ${T('bonus') || 'بونس'}</span>`);
  }

  parts.push(`<span class="draw-summary__prize">${prizeLabel}</span>`);
  el.innerHTML = parts.join('');
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
  const presetSelect = document.getElementById('game-preset');
  const presetKey = s.preset || 'custom';
  if (presetSelect) {
    if (!presetSelect.querySelector(`option[value=\"${presetKey}\"]`)) {
      renderPresetOptions();
    }
    presetSelect.value = presetKey;
  }
  document.getElementById('max-main').value = s.game.maxMain;
  document.getElementById('main-count').value = s.game.mainCount;
  document.getElementById('has-bonus').checked = s.game.hasBonus;
  document.getElementById('max-bonus').value = s.game.maxBonus;
  const maxBonusRow = document.getElementById('max-bonus-row');
  if (maxBonusRow) {
    maxBonusRow.style.display = s.game.hasBonus ? 'block' : 'none';
  }
  document.getElementById('ticket-price').value = s.pricing.ticketPrice;
  document.getElementById('tickets-per-day').value = s.pricing.ticketsPerDay;
  document.getElementById('total-tickets').value = s.pricing.totalTickets;
  document.getElementById('prize-map-text').value = s.prizeMap;
  syncFixedInputs();
  updateResultModeUI();
  
  updateGridConfig(s.game.maxMain, s.game.mainCount);
  updateKPIs();
  renderCurrentTicket(State.currentTicket);
  updateDayResult();
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

document.addEventListener('languageChanged', () => {
  renderPresetOptions();
});

document.addEventListener('presetChanged', (e) => {
  if (e.detail?.preset) {
    State.settings.preset = e.detail.preset;
  }
  renderPresetOptions();
});

export { initUI, showToast };

function updateResultModeUI() {
  const isVariable = Boolean(State.settings.target?.dailyRandom);
  document.querySelectorAll('[data-result-mode]').forEach((btn) => {
    const variableMode = btn.dataset.resultMode === 'variable';
    btn.classList.toggle('active', variableMode === isVariable);
  });
  const fixedFields = document.getElementById('result-fixed-fields');
  if (fixedFields) {
    fixedFields.style.display = isVariable ? 'none' : 'flex';
  }
  renderFixedPreview();
}

function renderFixedPreview() {
  const container = document.getElementById('fixed-preview');
  if (!container) return;
  const isVariable = Boolean(State.settings.target?.dailyRandom);
  container.innerHTML = '';
  container.style.display = isVariable ? 'none' : 'flex';
  if (isVariable) return;
  const fixed = Array.isArray(State.settings.target?.fixedMain)
    ? State.settings.target.fixedMain
    : [];
  const frag = document.createDocumentFragment();
  fixed.forEach((num) => {
    const span = document.createElement('span');
    span.className = 'draw-ball';
    span.textContent = String(num).padStart(2, '0');
    frag.appendChild(span);
  });
  if (State.settings.game.hasBonus && Number.isFinite(State.settings.target?.fixedBonus)) {
    const plus = document.createElement('span');
    plus.className = 'draw-split';
    plus.textContent = '+';
    frag.appendChild(plus);
    const bonus = document.createElement('span');
    bonus.className = 'draw-ball bonus';
    bonus.textContent = String(State.settings.target.fixedBonus).padStart(2, '0');
    frag.appendChild(bonus);
  }
  container.appendChild(frag);
}

function persistFixedMainInput(value) {
  State.settings.target = State.settings.target || {};
  const max = State.settings.game.maxMain;
  const count = State.settings.game.mainCount;
  const numbers = value
    .split(/[\s,]+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= max);
  const unique = [];
  numbers.forEach((n) => {
    if (!unique.includes(n)) unique.push(n);
  });
  State.settings.target.fixedMain = unique.slice(0, count);
  saveSettings();
  syncFixedInputs();
}

function persistFixedBonusInput(value) {
  State.settings.target = State.settings.target || {};
  if (!State.settings.game.hasBonus) {
    State.settings.target.fixedBonus = null;
  } else {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= State.settings.game.maxBonus) {
      State.settings.target.fixedBonus = parsed;
    } else {
      State.settings.target.fixedBonus = null;
    }
  }
  saveSettings();
  syncFixedInputs();
}

function syncFixedInputs() {
  const mainInput = document.getElementById('fixed-main-input');
  const bonusInput = document.getElementById('fixed-bonus-input');
  if (mainInput) {
    mainInput.value = Array.isArray(State.settings.target?.fixedMain)
      ? State.settings.target.fixedMain.join(', ')
      : '';
  }
  if (bonusInput) {
    bonusInput.value = Number.isFinite(State.settings.target?.fixedBonus)
      ? State.settings.target.fixedBonus
      : '';
  }
  renderFixedPreview();
}

function enforceFixedResultBounds() {
  State.settings.target = State.settings.target || {};
  const max = State.settings.game.maxMain;
  const count = State.settings.game.mainCount;
  const filtered = Array.isArray(State.settings.target.fixedMain)
    ? State.settings.target.fixedMain
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= max)
    : [];
  State.settings.target.fixedMain = filtered.slice(0, count);
  if (!State.settings.game.hasBonus) {
    State.settings.target.fixedBonus = null;
  } else if (
    !Number.isFinite(State.settings.target.fixedBonus) ||
    State.settings.target.fixedBonus < 1 ||
    State.settings.target.fixedBonus > State.settings.game.maxBonus
  ) {
    State.settings.target.fixedBonus = null;
  }
}
