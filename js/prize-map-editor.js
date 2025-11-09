// Prize Map Editor - User-friendly prize configuration
import { State, saveSettings, GAME_PRESETS, applyGamePreset, generateDefaultPrizeMap } from './state.js';
import { Currency } from './currency.js';
import { T } from './i18n.js';

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

function formatPrizeLabel(matches, bonus) {
  if (bonus && matches === 0) {
    const template = T('prizeLabelBonusOnly') || 'Bonus only prize';
    return template.replace('{count}', matches);
  }
  if (bonus) {
    const template = T('prizeLabelBonus') || 'Prize for {count} matches + bonus';
    return template.replace('{count}', matches);
  }
  const template = T('prizeLabel') || 'Prize for {count} matches';
  return template.replace('{count}', matches);
}

function prizeValueToInput(prize) {
  if (prize === -1) return 'JACKPOT';
  if (prize === 0) return '0';
  if (Number.isFinite(prize)) return prize.toLocaleString('en-US');
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
  
  container.innerHTML = '';
  
  const map = parsePrizeMapToMap(State.settings.prizeMap);
  const keys = sortPrizeKeys(mergePrizeKeys(State.settings.game, map));
  if (keys.length === 0) {
    container.textContent = T('noPrizeData') || 'No prize data available';
    return;
  }
  
  const fragment = document.createDocumentFragment();
  const unitLabel = Currency.base.sym || '?????';
  const jackpotMatches = State.settings.game.mainCount;
  
  keys.forEach((key) => {
    const [matches, bonus] = key.split(',').map((n) => Number.parseInt(n, 10) || 0);
    const prize = map.get(key);
    const label = formatPrizeLabel(matches, bonus);
    const tier = document.createElement('div');
    const isJackpot = prize === -1 || matches === jackpotMatches;
    tier.className = `prize-tier${isJackpot ? ' prize-tier--jackpot' : ''}`;
    
    const labelWrap = document.createElement('div');
    labelWrap.className = 'prize-tier__label';
    const title = document.createElement('span');
    title.textContent = label;
    labelWrap.appendChild(title);
    if (bonus > 0) {
      const tag = document.createElement('span');
      tag.className = 'prize-tier__tag';
      tag.textContent = T('bonus') || 'Bonus';
      labelWrap.appendChild(tag);
    }
    
    const inputWrap = document.createElement('div');
    inputWrap.className = 'prize-tier__input';
    const unit = document.createElement('span');
    unit.className = 'prize-tier__unit';
    unit.textContent = unitLabel;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.className = 'prize-input';
    input.dataset.key = key;
    input.value = prizeValueToInput(prize);
    inputWrap.appendChild(unit);
    inputWrap.appendChild(input);
    
    if (isJackpot) {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-star prize-tier__icon';
      icon.setAttribute('aria-hidden', 'true');
      inputWrap.appendChild(icon);
    }
    
    tier.appendChild(labelWrap);
    tier.appendChild(inputWrap);
    fragment.appendChild(tier);
  });
  
  container.appendChild(fragment);
  
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

document.addEventListener('currencyChanged', () => {
  updatePrizeMapUI();
});

export { initPrizeMapEditor, updatePrizeMapUI };
