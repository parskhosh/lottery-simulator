// Enhanced log viewer with virtualization per tab
import { State } from './state.js';
import { Currency, fmtDual } from './currency.js';
import { T } from './i18n.js';

const ROW_HEIGHT = 44;
const BUFFER_ROWS = 8;

const tabs = {
  purchases: {},
  wins: {}
};

let viewportEl = null;
let headerEl = null;
let countEl = null;
let currentTab = 'purchases';
let pendingFrame = null;
let pendingNeedsWinSync = false;

function initLogs() {
  viewportEl = document.getElementById('log-viewport');
  headerEl = document.getElementById('log-header');
  countEl = document.getElementById('log-count');

  if (!viewportEl || !headerEl) {
    return;
  }

  tabs.purchases = {
    key: 'purchases',
    panel: document.getElementById('panel-purchases'),
    content: document.getElementById('log-content'),
    spacerTop: document.getElementById('log-spacer-top'),
    spacerBottom: document.getElementById('log-spacer-bottom'),
    filtered: [],
    scrollTop: 0,
    total: 0
  };

  if (tabs.purchases.panel) {
    tabs.purchases.panel.hidden = false;
  }

  tabs.wins = {
    key: 'wins',
    panel: document.getElementById('panel-wins'),
    content: document.getElementById('log-content-wins'),
    spacerTop: document.getElementById('log-spacer-top-wins'),
    spacerBottom: document.getElementById('log-spacer-bottom-wins'),
    filtered: [],
    scrollTop: 0,
    total: 0
  };

  if (tabs.wins.panel) {
    tabs.wins.panel.hidden = true;
  }

  viewportEl.addEventListener('scroll', handleScroll, { passive: true });

  document.querySelectorAll('.log-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  setupFilters();
  renderHeader();
  switchTab('purchases', { silent: true });
  updateFilters('purchases', { resetScroll: true });
  updateFilters('wins');
  updateLogSummary();

  document.addEventListener('languageChanged', () => {
    renderHeader();
    updateLogSummary();
  });
}

function setupFilters() {
  const winsOnly = document.getElementById('log-wins-only');
  const minPrize = document.getElementById('log-min-prize');
  const maxPrize = document.getElementById('log-max-prize');
  const minMatch = document.getElementById('log-min-match');
  const search = document.getElementById('log-search');

  winsOnly?.addEventListener('change', () => updateFilters('purchases', { resetScroll: true }));
  [minPrize, maxPrize, minMatch, search].forEach((el) => {
    el?.addEventListener('input', () => {
      updateFilters('purchases', { debounce: true });
      updateFilters('wins', { debounce: true });
    });
  });
}

function switchTab(tabKey, options = {}) {
  if (!tabs[tabKey] || currentTab === tabKey) {
    if (!options.silent) renderVisible(true);
    return;
  }

  currentTab = tabKey;

  document.querySelectorAll('.log-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabKey);
  });

  Object.values(tabs).forEach((tab) => {
    if (tab.panel) {
      tab.panel.hidden = tab.key !== tabKey;
    }
  });

  viewportEl.scrollTop = tabs[tabKey].scrollTop || 0;
  renderVisible(true);
  updateLogSummary();

  if (!options.skipFilter) {
    updateFilters(tabKey);
  }
}

function handleScroll() {
  const tab = tabs[currentTab];
  if (!tab) return;
  tab.scrollTop = viewportEl.scrollTop;
  renderVisible();
}

function getFilters() {
  const winsOnly = document.getElementById('log-wins-only')?.checked || false;
  const minPrizeVal = parseFloat(document.getElementById('log-min-prize')?.value || '0');
  const maxPrizeVal = parseFloat(document.getElementById('log-max-prize')?.value || '');
  const minMatch = parseInt(document.getElementById('log-min-match')?.value || '0', 10);
  const search = document.getElementById('log-search')?.value?.trim().toLowerCase() || '';

  const toMinor = (value) => Math.round(value * Currency.base.minor);

  return {
    winsOnly,
    minPrize: minPrizeVal > 0 ? toMinor(minPrizeVal) : 0,
    maxPrize: maxPrizeVal > 0 ? toMinor(maxPrizeVal) : Infinity,
    minMatch: Number.isFinite(minMatch) ? minMatch : 0,
    search
  };
}

function updateFilters(tabKey = currentTab, options = {}) {
  const tab = tabs[tabKey];
  if (!tab) return;

  const filters = getFilters();
  const source = tabKey === 'wins' ? State.winsLog : State.purchaseLog;

  tab.filtered = source.filter((row) => {
    if (!row) return false;

    if (tabKey === 'purchases' && filters.winsOnly && row.prize <= 0 && row.type !== 'jackpot') {
      return false;
    }

    if (filters.minPrize > 0 && row.prize < filters.minPrize && row.type !== 'jackpot') {
      return false;
    }

    if (filters.maxPrize < Infinity && row.prize > filters.maxPrize) {
      return false;
    }

    const effectiveMatches = row.matches + (row.bonusMatch ? 1 : 0);
    if (filters.minMatch > 0 && effectiveMatches < filters.minMatch) {
      return false;
    }

    if (filters.search && !matchesSearch(row, filters.search)) {
      return false;
    }

    return true;
  });

  tab.total = source.length;

  if (tabKey === currentTab) {
    if (options.resetScroll) {
      viewportEl.scrollTop = 0;
      tab.scrollTop = 0;
    }
    renderVisible(true);
    updateLogSummary();
  }
}

function renderVisible(forceReset = false) {
  const tab = tabs[currentTab];
  if (!tab || !tab.content || !tab.spacerTop || !tab.spacerBottom) return;

  if (forceReset) {
    viewportEl.scrollTop = tab.scrollTop || 0;
  }

  const data = tab.filtered || [];
  const viewportHeight = viewportEl.clientHeight || 0;
  const scrollTop = viewportEl.scrollTop || 0;

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const end = Math.min(data.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

  tab.spacerTop.style.height = `${start * ROW_HEIGHT}px`;
  tab.spacerBottom.style.height = `${Math.max(0, (data.length - end) * ROW_HEIGHT)}px`;

  tab.content.innerHTML = '';

  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'log-empty';
    empty.textContent = currentTab === 'wins'
      ? T('logNoWins') || 'No wins yet'
      : T('logNoResults') || 'No entries yet';
    tab.content.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (let i = start; i < end; i += 1) {
    fragment.appendChild(createLogRow(data[i]));
  }
  tab.content.appendChild(fragment);
}

function createLogRow(row) {
  const rowEl = document.createElement('div');
  rowEl.className = 'log-row';

  if (row.type === 'jackpot') {
    rowEl.classList.add('jackpot');
  } else if (row.prize > 0) {
    rowEl.classList.add('win');
  }

  const result = formatResult(row);
  const matches = formatMatches(row);
  const prize = row.type === 'jackpot' ? (T('logJackpot') || 'Jackpot') : fmtDual(row.prize);
  const cost = fmtDual(row.cost);
  const net = row.type === 'jackpot' ? '—' : fmtDual(row.net);
  const time = formatTime(row);
  const numbers = formatNumbers(row);

  rowEl.innerHTML = `
    <span class="col-idx">#${row.idx}</span>
    <span class="col-type">${result}</span>
    <span class="col-match">${matches}</span>
    <span class="col-prize">${prize}</span>
    <span class="col-cost">${cost}</span>
    <span class="col-net">${net}</span>
    <span class="col-time">${time}</span>
    <span class="col-numbers">${numbers}</span>
  `;

  const netEl = rowEl.querySelector('.col-net');
  if (netEl && row.type !== 'jackpot') {
    netEl.classList.toggle('positive', row.net > 0);
    netEl.classList.toggle('negative', row.net < 0);
  }

  rowEl.addEventListener('mouseenter', () => {
    const event = new CustomEvent('logRowHover', { detail: { row } });
    document.dispatchEvent(event);
  });

  return rowEl;
}

function formatResult(row) {
  if (row.type === 'jackpot') {
    return T('logResultJackpot') || 'Jackpot';
  }
  if (row.prize > 0) {
    return T('logResultWin') || 'Win';
  }
  return T('logResultLoss') || 'Loss';
}

function formatMatches(row) {
  const bonusBadge = row.bonusMatch ? ` +${T('logBonusShort') || 'B'}` : '';
  return `${row.matches}${bonusBadge}`;
}

function formatTime(row) {
  if (!row.time) return `D${row.day || 0}`;
  const date = new Date(row.time);
  const dayLabel = T('logDayShort') || 'Day';
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${dayLabel} ${row.day || 0} • ${timeStr}`;
}

function formatNumbers(row) {
  const main = Array.isArray(row.main) ? row.main.join(', ') : '';
  if (row.bonus) {
    return `${main} | ${T('logBonusShort') || 'B'} ${row.bonus}`;
  }
  return main;
}

function matchesSearch(row, needle) {
  const blob = [
    row.idx,
    row.type,
    row.matches,
    row.prize,
    row.cost,
    row.main?.join(' ') || '',
    row.bonus || '',
    row.day
  ].join(' ').toLowerCase();
  return blob.includes(needle);
}

function renderHeader() {
  if (!headerEl) return;
  const columns = [
    { key: 'logColIndex' },
    { key: 'logColType' },
    { key: 'logColMatches' },
    { key: 'logColPrize' },
    { key: 'logColCost' },
    { key: 'logColNet' },
    { key: 'logColTime' },
    { key: 'logColNumbers' }
  ];

  headerEl.innerHTML = columns
    .map((col) => `<span>${T(col.key) || col.key}</span>`)
    .join('');
}

function updateLogSummary() {
  if (!countEl) return;
  const tab = tabs[currentTab];
  const visible = tab?.filtered?.length || 0;
  const total = tab?.total || 0;
  const label = T('logCount') || 'Rows';
  countEl.textContent = `${label}: ${visible.toLocaleString()} / ${total.toLocaleString()}`;
}

function queueLogRefresh(forceWin = false) {
  pendingNeedsWinSync = pendingNeedsWinSync || forceWin;
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    const shouldSyncWins = pendingNeedsWinSync;
    pendingNeedsWinSync = false;
    pendingFrame = null;
    updateFilters('purchases');
    if (shouldSyncWins) {
      updateFilters('wins');
    }
  });
}

function cancelScheduledFrame() {
  if (pendingFrame) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }
  pendingNeedsWinSync = false;
}

function addLogEntry(row) {
  queueLogRefresh(row?.prize > 0 || row?.type === 'jackpot');
}

function renderLogs() {
  cancelScheduledFrame();
  updateFilters('purchases', { resetScroll: true });
  updateFilters('wins');
}

export { initLogs, renderLogs, addLogEntry, updateFilters };
