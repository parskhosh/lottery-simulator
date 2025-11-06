// Prize Map Editor - User-friendly prize configuration
import { State, saveSettings, GAME_PRESETS, applyGamePreset, generateDefaultPrizeMap } from './state.js';
import { T } from './i18n.js';

const BONUS_SYMBOL = {
  0: '✗',
  1: '✓'
};

function normalizePrizeKey(matches, bonus) {
  const safeMain = Number.isFinite(matches) ? Math.max(0, Math.floor(matches)) : 0;
  const safeBonus = Number.isFinite(bonus) && bonus > 0 ? 1 : 0;
  return `${safeMain},${safeBonus}`;
}

function parsePrizeMapToMap(text) {
  const map = new Map();
  if (!text) return map;
  
  text.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    const [rawKey, rawValue] = trimmed.split('=').map((part) => part.trim());
    if (!rawKey || rawValue === undefined) return;
    
    const parts = rawKey.split(',');
    const matches = Number.parseInt(parts[0], 10);
    const bonus = parts.length > 1 ? Number.parseInt(parts[1], 10) : 0;
    const key = normalizePrizeKey(matches, bonus);
    
    const upperValue = rawValue.toUpperCase();
    let prize;
    if (upperValue === 'JACKPOT') {
      prize = -1;
    } else if (upperValue === 'FREE_PLAY') {
      prize = 0;
    } else {
      const numeric = Number.parseInt(rawValue.replace(/[, _]/g, ''), 10);
      if (!Number.isFinite(numeric)) return;
      prize = numeric;
    }
    
    map.set(key, prize);
  });
  
  return map;
}

function mergePrizeKeys(game, ...maps) {
  const keys = new Set();
  const mainCount = Number.parseInt(game.mainCount, 10) || 0;
  const hasBonus = Boolean(game.hasBonus);
  
  if (mainCount >= 2) {
    for (let matches = mainCount; matches >= 2; matches--) {
      if (hasBonus) {
        keys.add(normalizePrizeKey(matches, 1));
        keys.add(normalizePrizeKey(matches, 0));
      } else {
        keys.add(normalizePrizeKey(matches, 0));
      }
    }
  }
  
  // Ensure jackpot rows exist
  if (hasBonus) {
    keys.add(normalizePrizeKey(mainCount, 1));
    keys.add(normalizePrizeKey(mainCount, 0));
    keys.add(normalizePrizeKey(1, 1));
    keys.add(normalizePrizeKey(0, 1));
  } else {
    keys.add(normalizePrizeKey(mainCount, 0));
  }
  
  maps.forEach((map) => {
    map.forEach((_, key) => keys.add(key));
  });
  
  return Array.from(keys);
}

function sortPrizeKeys(keys) {
  return keys.sort((a, b) => {
    const [am, ab] = a.split(',').map((n) => Number.parseInt(n, 10) || 0);
    const [bm, bb] = b.split(',').map((n) => Number.parseInt(n, 10) || 0);
    if (am !== bm) return bm - am;
    return bb - ab;
  });
}

function prizeValueToInput(prize) {
  if (prize === -1) return 'JACKPOT';
  if (prize === 0) return '0';
  if (Number.isFinite(prize)) return String(prize);
  return '';
}

function hydratePresetSelect(select) {
  if (!select) return;
  
  const previousValue = select.value;
  const fragment = document.createDocumentFragment();
  
  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = T('custom') || 'Custom';
  fragment.appendChild(customOption);
  
  Object.entries(GAME_PRESETS).forEach(([key, preset]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = T(preset.labelKey) || preset.labelKey;
    fragment.appendChild(option);
  });
  
  select.innerHTML = '';
  select.appendChild(fragment);
  
  if (previousValue && select.querySelector(`option[value="${previousValue}"]`)) {
    select.value = previousValue;
  } else {
    select.value = 'custom';
  }
}

function updatePrizeMapUI() {
  const container = document.getElementById('prize-map-visual');
  if (!container) return;
  
  const game = State.settings.game;
  const normalizedMap = parsePrizeMapToMap(State.settings.prizeMap);
  const defaultMap = parsePrizeMapToMap(generateDefaultPrizeMap(game.mainCount, game.hasBonus));
  const keys = sortPrizeKeys(mergePrizeKeys(game, normalizedMap, defaultMap));
  
  container.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'prize-summary';
  summary.innerHTML = `
    <div class="summary-item">
      <span>${T('prizeSummaryMain') || 'Main balls'}</span>
      <strong>${game.mainCount}/${game.maxMain}</strong>
    </div>
    ${game.hasBonus ? `
      <div class="summary-item">
        <span>${T('prizeSummaryBonus') || 'Bonus range'}</span>
        <strong>1-${game.maxBonus}</strong>
      </div>` : ''}
    <div class="summary-item">
      <span>${T('prizeSummaryTiers') || 'Payout tiers'}</span>
      <strong>${keys.length}</strong>
    </div>
    <div class="summary-item">
      <span>${T('prizeSummaryFilled') || 'Configured'}</span>
      <strong>${normalizedMap.size}/${keys.length}</strong>
    </div>
  `;
  container.appendChild(summary);
  
  const header = document.createElement('div');
  header.className = 'prize-map-header';
  header.innerHTML = `
    <div class="prize-map-header-main">
      <h4>${T('prizeMap')} • ${game.mainCount}/${game.maxMain}${game.hasBonus ? ` + ${T('hasBonus') || 'Bonus'} (${game.maxBonus})` : ''}</h4>
      <p class="prize-map-subtitle">${T('prizeSummaryHint') || 'Adjust payouts and keep raw values in sync.'}</p>
    </div>
    <div class="prize-map-actions">
      <button id="btn-generate-prize-map" class="btn btn-sm btn-primary">${T('generate') || 'Generate'}</button>
      <select id="prize-preset-select" class="prize-preset-select"></select>
    </div>
  `;
  container.appendChild(header);
  
  const presetSelect = header.querySelector('#prize-preset-select');
  hydratePresetSelect(presetSelect);
  if (presetSelect) {
    const presetKey = State.settings.preset && GAME_PRESETS[State.settings.preset]
      ? State.settings.preset
      : 'custom';
    presetSelect.value = presetKey;
  }
  
  const table = document.createElement('table');
  table.className = 'prize-map-table';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>${T('match') || 'Match'}</th>
      ${game.hasBonus ? `<th>${T('bonus') || 'Bonus'}</th>` : ''}
      <th>${T('prize') || 'Prize'}</th>
      <th>${T('action') || 'Action'}</th>
    </tr>
  `;
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  
  keys.forEach((key) => {
    const [matchesRaw, bonusRaw] = key.split(',').map((n) => Number.parseInt(n, 10) || 0);
    const matches = matchesRaw;
    const bonus = bonusRaw > 0 ? 1 : 0;
    const isJackpot = matches === game.mainCount && (game.hasBonus ? bonus === 1 : true);
    const shouldRender = matches >= 2 || normalizedMap.has(key);
    if (!shouldRender) return;
    
    const row = document.createElement('tr');
    row.className = 'prize-row';
    
    const matchCell = document.createElement('td');
    matchCell.className = 'match-cell';
    matchCell.textContent = isJackpot ? 'JACKPOT' : `${matches}/${game.mainCount}`;
    row.appendChild(matchCell);
    
    if (game.hasBonus) {
      const bonusCell = document.createElement('td');
      bonusCell.className = 'bonus-cell';
      bonusCell.textContent = BONUS_SYMBOL[bonus];
      row.appendChild(bonusCell);
    }
    
    const prizeCell = document.createElement('td');
    prizeCell.className = 'prize-cell';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prize-input';
    input.dataset.key = key;
    
    const currentPrize = normalizedMap.get(key);
    
    if (normalizedMap.has(key)) {
      input.value = prizeValueToInput(normalizedMap.get(key));
    } else if (defaultMap.has(key)) {
      input.placeholder = prizeValueToInput(defaultMap.get(key));
    } else {
      input.placeholder = '0';
    }
    
    prizeCell.appendChild(input);
    row.appendChild(prizeCell);
    
    const actionCell = document.createElement('td');
    actionCell.className = 'action-cell';
    if (isJackpot) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '★';
      actionCell.appendChild(badge);
    }
    row.appendChild(actionCell);
    
    if (!currentPrize && !isJackpot) {
      row.classList.add('missing');
      row.title = T('prizeMissingHint') || 'No payout configured for this tier';
    }
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
  
  const textarea = document.getElementById('prize-map-text');
  if (textarea) {
    textarea.value = State.settings.prizeMap || '';
  }
  
  setupPrizeMapHandlers();
}

function parsePrizeInputValue(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === 'JACKPOT') return -1;
  if (trimmed.toUpperCase() === 'FREE_PLAY') return 0;
  const numeric = Number.parseInt(trimmed.replace(/[, _]/g, ''), 10);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function updatePrizeMapFromUI() {
  const inputs = Array.from(document.querySelectorAll('.prize-input'));
  const lines = [];
  
  inputs.forEach((input) => {
    const key = input.dataset.key;
    const value = parsePrizeInputValue(input.value);
    if (value === null) return;
    if (value === 0) {
      lines.push(`${key}=FREE_PLAY`);
    } else if (value === -1) {
      lines.push(`${key}=JACKPOT`);
    } else {
      lines.push(`${key}=${value}`);
    }
  });
  
  State.settings.prizeMap = lines.join('\n');
  State.settings.preset = 'custom';
  saveSettings();
  
  const textarea = document.getElementById('prize-map-text');
  if (textarea) {
    textarea.value = State.settings.prizeMap;
  }
  
  document.dispatchEvent(new CustomEvent('presetChanged', { detail: { preset: 'custom' } }));
  updatePrizeMapUI();
}

function setupPrizeMapHandlers() {
  const generateBtn = document.getElementById('btn-generate-prize-map');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const game = State.settings.game;
      State.settings.prizeMap = generateDefaultPrizeMap(game.mainCount, game.hasBonus);
      State.settings.preset = 'custom';
      saveSettings();
      updatePrizeMapUI();
      document.dispatchEvent(new CustomEvent('presetChanged', { detail: { preset: 'custom' } }));
      const toastEvent = new CustomEvent('showToast', {
        detail: { message: T('prizeMapGenerated') || 'Prize map generated', type: 'success' }
      });
      document.dispatchEvent(toastEvent);
    });
  }
  
  const presetSelect = document.getElementById('prize-preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      if (!value || value === 'custom') {
        State.settings.preset = 'custom';
        saveSettings();
        updatePrizeMapUI();
        return;
      }
      const preset = applyGamePreset(value);
      if (!preset) return;
      
      saveSettings();
      document.dispatchEvent(new CustomEvent('gameSettingsChanged'));
      document.dispatchEvent(new CustomEvent('presetChanged', { detail: { preset: value } }));
      
      const toastEvent = new CustomEvent('showToast', {
        detail: {
          message: `${T(preset.labelKey) || preset.labelKey} ${T('presetApplied') || 'preset applied'}`,
          type: 'success'
        }
      });
      document.dispatchEvent(toastEvent);
    });
  }
  
  const inputs = document.querySelectorAll('.prize-input');
  inputs.forEach((input) => {
    input.addEventListener('blur', updatePrizeMapFromUI);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updatePrizeMapFromUI();
      }
    });
  });
}

function initPrizeMapEditor() {
  updatePrizeMapUI();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPrizeMapEditor);
} else {
  setTimeout(initPrizeMapEditor, 100);
}

document.addEventListener('gameSettingsChanged', () => {
  updatePrizeMapUI();
});

document.addEventListener('languageChanged', () => {
  updatePrizeMapUI();
});

export { initPrizeMapEditor, updatePrizeMapUI };
