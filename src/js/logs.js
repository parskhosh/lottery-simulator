// Virtualized logs module
import { State } from './state.js';
import { fmtDual } from './currency.js';
import { T } from './i18n.js';

let viewportEl = null;
let contentEl = null;
let spacerTopEl = null;
let spacerBottomEl = null;
let rowHeight = 32;
let scrollTop = 0;
let visibleStart = 0;
let visibleEnd = 0;
let filteredLog = [];
let currentTab = 'purchases';

// Initialize logs
function initLogs() {
  viewportEl = document.getElementById('log-viewport');
  // Tabs now handled by controller.js - use appropriate panel
  contentEl = document.getElementById('log-content') || document.getElementById('panel-purchases')?.querySelector('.log-content');
  spacerTopEl = document.getElementById('log-spacer-top') || document.getElementById('panel-purchases')?.querySelector('.log-spacer-top');
  spacerBottomEl = document.getElementById('log-spacer-bottom') || document.getElementById('panel-purchases')?.querySelector('.log-spacer-bottom');
  
  if (!viewportEl || !contentEl) return;
  
  viewportEl.addEventListener('scroll', handleScroll);
  
  // Tab switching - sync with controller's tab handler
  document.querySelectorAll('.log-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      // Panel switching is handled by controller.js
      updateFilters();
    });
  });
  
  // Listen to panel changes from controller
  document.querySelectorAll('[data-panel]').forEach(panel => {
    const observer = new MutationObserver(() => {
      if (!panel.hidden && panel.id === `panel-${currentTab}`) {
        // Update content/spacer refs to current panel
        contentEl = panel.querySelector('.log-content');
        spacerTopEl = panel.querySelector('.log-spacer-top');
        spacerBottomEl = panel.querySelector('.log-spacer-bottom');
        updateFilters();
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  });
  
  // Filter inputs
  document.getElementById('log-wins-only')?.addEventListener('change', updateFilters);
  document.getElementById('log-min-prize')?.addEventListener('input', updateFilters);
  document.getElementById('log-max-prize')?.addEventListener('input', updateFilters);
  document.getElementById('log-min-match')?.addEventListener('input', updateFilters);
  document.getElementById('log-search')?.addEventListener('input', updateFilters);
}

// Update filters
function updateFilters() {
  const winsOnly = document.getElementById('log-wins-only')?.checked || false;
  const minPrize = parseFloat(document.getElementById('log-min-prize')?.value) || 0;
  const maxPrize = parseFloat(document.getElementById('log-max-prize')?.value) || Infinity;
  const minMatch = parseInt(document.getElementById('log-min-match')?.value) || 0;
  const search = document.getElementById('log-search')?.value?.toLowerCase() || '';
  
  let source = currentTab === 'wins' ? State.winsLog : State.purchaseLog;
  
  filteredLog = source.filter(row => {
    if (winsOnly && row.matches < 3 && row.type !== 'jackpot') return false;
    if (row.prize < minPrize) return false;
    if (row.prize > maxPrize) return false;
    if (row.matches < minMatch) return false;
    if (search && !JSON.stringify(row).toLowerCase().includes(search)) return false;
    return true;
  });
  
  renderVisible();
}

// Handle scroll
function handleScroll() {
  if (!viewportEl) return;
  scrollTop = viewportEl.scrollTop;
  renderVisible();
}

// Render visible rows
function renderVisible() {
  if (!contentEl || !spacerTopEl || !spacerBottomEl) return;
  
  const viewportHeight = viewportEl.clientHeight;
  const buffer = 5;
  
  visibleStart = Math.floor(scrollTop / rowHeight);
  visibleEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer;
  
  visibleStart = Math.max(0, visibleStart - buffer);
  visibleEnd = Math.min(filteredLog.length, visibleEnd);
  
  // Update spacers
  spacerTopEl.style.height = `${visibleStart * rowHeight}px`;
  spacerBottomEl.style.height = `${(filteredLog.length - visibleEnd) * rowHeight}px`;
  
  // Render visible rows
  contentEl.innerHTML = '';
  
  for (let i = visibleStart; i < visibleEnd; i++) {
    const row = filteredLog[i];
    const rowEl = createLogRow(row, i);
    contentEl.appendChild(rowEl);
  }
}

// Create log row element
function createLogRow(row, idx) {
  const rowEl = document.createElement('div');
  rowEl.className = 'log-row';
  
  if (row.type === 'jackpot') {
    rowEl.classList.add('jackpot');
  } else if (row.matches >= 3 || row.type === 'small') {
    rowEl.classList.add('win');
  }
  
  // Format time
  const date = new Date(row.time);
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  
  // Format matches
  const matchStr = row.bonus ? `${row.matches}+B` : `${row.matches}`;
  
  rowEl.innerHTML = `
    <span>${row.idx}</span>
    <span>${row.type || 'auto'}</span>
    <span>${matchStr}</span>
    <span>${fmtDual(row.prize)}</span>
    <span>${fmtDual(row.cost)}</span>
    <span>${fmtDual(row.prize - row.cost)}</span>
    <span>D${row.day} ${timeStr}</span>
  `;
  
  // Hover to highlight numbers in grid
  rowEl.addEventListener('mouseenter', () => {
    // This will be handled by ticket.js
    const event = new CustomEvent('logRowHover', { detail: { row } });
    document.dispatchEvent(event);
  });
  
  return rowEl;
}

// Add log entry
function addLogEntry(row) {
  // Logs are added to State in state.js
  // Just trigger re-render if visible
  updateFilters();
}

// Initial render
function renderLogs() {
  updateFilters();
}

export { initLogs, renderLogs, addLogEntry, updateFilters };


