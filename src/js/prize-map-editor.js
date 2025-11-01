// Prize Map Editor - User-friendly prize configuration
import { State, saveSettings } from './state.js';
import { T } from './i18n.js';

// Generate prize map template based on game settings
function generatePrizeMapTemplate(mainCount, hasBonus, maxBonus = 10) {
  const lines = [];
  
  // Jackpot (all main numbers + bonus if available)
  if (hasBonus) {
    lines.push(`${mainCount},1=JACKPOT`); // All main + bonus
    lines.push(`${mainCount},0=1000000`); // All main without bonus
  } else {
    lines.push(`${mainCount}=JACKPOT`); // All main (no bonus)
  }
  
  // Generate all match levels (from max down to 2)
  for (let matches = mainCount - 1; matches >= 2; matches--) {
    if (hasBonus) {
      // With bonus
      lines.push(`${matches},1=100000`);
      // Without bonus
      lines.push(`${matches},0=10000`);
    } else {
      // Without bonus system
      lines.push(`${matches}=10000`);
    }
  }
  
  // Lower tier prizes (optional - 2 matches)
  if (hasBonus) {
    lines.push(`2,1=100`);
    lines.push(`2,0=10`);
  } else {
    lines.push(`2=10`);
  }
  
  return lines.join('\n');
}

// Preset prize maps for real lotteries
const PRIZE_PRESETS = {
  megaMillions: {
    name: 'Mega Millions',
    game: { maxMain: 70, mainCount: 5, hasBonus: true, maxBonus: 25 },
    prizeMap: `5,1=JACKPOT
5,0=1000000
4,1=10000
4,0=500
3,1=200
3,0=10
2,1=10
1,1=4
0,1=2`
  },
  powerball: {
    name: 'Powerball',
    game: { maxMain: 69, mainCount: 5, hasBonus: true, maxBonus: 26 },
    prizeMap: `5,1=JACKPOT
5,0=1000000
4,1=50000
4,0=100
3,1=100
3,0=7
2,1=7
1,1=4
0,1=4`
  },
  euroMillions: {
    name: 'EuroMillions',
    game: { maxMain: 50, mainCount: 5, hasBonus: true, maxBonus: 12 },
    prizeMap: `5,2=JACKPOT
5,1=1000000
5,0=100000
4,2=5000
4,1=100
4,0=100
3,2=50
3,1=25
3,0=25
2,2=15
2,1=10
2,0=10`
  },
  classic649: {
    name: 'Classic 6/49',
    game: { maxMain: 49, mainCount: 6, hasBonus: true, maxBonus: 10 },
    prizeMap: `6,1=JACKPOT
6,0=1000000
5,1=100000
5,0=10000
4,1=1000
4,0=100
3,1=50
3,0=10
2,1=5`
  },
  mini535: {
    name: 'Mini 5/35',
    game: { maxMain: 35, mainCount: 5, hasBonus: false, maxBonus: 0 },
    prizeMap: `5=JACKPOT
4=10000
3=100
2=10`
  }
};

// Initialize prize map editor
function initPrizeMapEditor() {
  const container = document.getElementById('prize-map-visual');
  if (!container) return;
  
  // Create editable prize map UI
  updatePrizeMapUI();
  
  // Listen for game settings changes
  document.addEventListener('gameSettingsChanged', () => {
    updatePrizeMapUI();
  });
}

// Update prize map UI based on current game settings
function updatePrizeMapUI() {
  const container = document.getElementById('prize-map-visual');
  const game = State.settings.game;
  
  if (!container) return;
  
  container.innerHTML = '';
  
  // Header
  const header = document.createElement('div');
  header.className = 'prize-map-header';
  header.innerHTML = `
    <h4>${T('prizeMap')} - ${game.mainCount}/${game.maxMain}${game.hasBonus ? ` + Bonus (1-${game.maxBonus})` : ''}</h4>
    <button id="btn-generate-prize-map" class="btn btn-sm btn-primary">${T('generate') || 'Generate'}</button>
    <select id="prize-preset-select" class="btn btn-sm">
      <option value="">${T('custom') || 'Custom'}</option>
      ${Object.entries(PRIZE_PRESETS).map(([key, preset]) => 
        `<option value="${key}">${preset.name}</option>`
      ).join('')}
    </select>
  `;
  container.appendChild(header);
  
  // Generate table
  const table = document.createElement('table');
  table.className = 'prize-map-table';
  
  // Header row
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
  
  // Body
  const tbody = document.createElement('tbody');
  
  // Generate all possible match combinations
  for (let matches = game.mainCount; matches >= 2; matches--) {
    if (game.hasBonus) {
      // With bonus
      const row1 = createPrizeRow(matches, true, game);
      tbody.appendChild(row1);
      // Without bonus
      const row2 = createPrizeRow(matches, false, game);
      tbody.appendChild(row2);
    } else {
      // Without bonus
      const row = createPrizeRow(matches, false, game);
      tbody.appendChild(row);
    }
  }
  
  // Jackpot row
  const jackpotRow = createPrizeRow(
    game.mainCount, 
    game.hasBonus, 
    game, 
    true // isJackpot
  );
  tbody.insertBefore(jackpotRow, tbody.firstChild);
  
  table.appendChild(tbody);
  container.appendChild(table);
  
  // Event handlers
  setupPrizeMapHandlers();
}

// Create a prize row
function createPrizeRow(matches, hasBonus, game, isJackpot = false) {
  const row = document.createElement('tr');
  row.className = 'prize-row';
  
  // Get current prize value from prize map
  const mapKey = hasBonus ? `${matches},1` : `${matches}`;
  const currentPrize = parsePrizeMap(State.settings.prizeMap).get(mapKey);
  
  const matchLabel = matches === game.mainCount 
    ? (isJackpot ? 'JACKPOT' : `${matches}/${game.mainCount}`)
    : `${matches}/${game.mainCount}`;
  
  row.innerHTML = `
    <td class="match-cell">
      ${matchLabel}
    </td>
    ${game.hasBonus ? `
      <td class="bonus-cell">
        ${hasBonus ? '✓' : '✗'}
      </td>
    ` : ''}
    <td class="prize-cell">
      <input type="text" 
             class="prize-input" 
             data-key="${mapKey}"
             value="${currentPrize === -1 ? 'JACKPOT' : (currentPrize || '0')}"
             placeholder="${isJackpot ? 'JACKPOT' : '0'}"
      />
    </td>
    <td class="action-cell">
      ${isJackpot ? '<span class="badge">★</span>' : ''}
    </td>
  `;
  
  return row;
}

// Parse existing prize map
function parsePrizeMap(text) {
  const map = new Map();
  const lines = text.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    const [key, value] = line.split('=').map(s => s.trim());
    if (!key || !value) continue;
    
    let prize = 0;
    if (value === 'JACKPOT') {
      prize = -1; // Special marker
    } else {
      prize = parseInt(value) || 0;
    }
    
    map.set(key, prize);
  }
  
  return map;
}

// Update prize map from UI
function updatePrizeMapFromUI() {
  const inputs = document.querySelectorAll('.prize-input');
  const lines = [];
  
  inputs.forEach(input => {
    const key = input.dataset.key;
    let value = input.value.trim();
    
    if (!value || value === '0') return; // Skip empty or zero prizes
    
    if (value.toUpperCase() === 'JACKPOT') {
      lines.push(`${key}=JACKPOT`);
    } else {
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue > 0) {
        lines.push(`${key}=${numValue}`);
      }
    }
  });
  
  State.settings.prizeMap = lines.join('\n');
  saveSettings();
  
  // Update textarea
  const textarea = document.getElementById('prize-map-text');
  if (textarea) {
    textarea.value = State.settings.prizeMap;
  }
}

// Setup event handlers
function setupPrizeMapHandlers() {
  // Generate button
  const generateBtn = document.getElementById('btn-generate-prize-map');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const game = State.settings.game;
      const template = generatePrizeMapTemplate(
        game.mainCount, 
        game.hasBonus, 
        game.maxBonus
      );
      State.settings.prizeMap = template;
      
      const textarea = document.getElementById('prize-map-text');
      if (textarea) textarea.value = template;
      
      updatePrizeMapUI();
      saveSettings();
      
      const event = new CustomEvent('showToast', { 
        detail: { message: 'Prize map generated', type: 'success' } 
      });
      document.dispatchEvent(event);
    });
  }
  
  // Preset selector
  const presetSelect = document.getElementById('prize-preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const presetKey = e.target.value;
      if (!presetKey) return;
      
      const preset = PRIZE_PRESETS[presetKey];
      if (!preset) return;
      
      // Apply game settings
      State.settings.game = { ...State.settings.game, ...preset.game };
      State.settings.prizeMap = preset.prizeMap;
      
      // Update UI
      const textarea = document.getElementById('prize-map-text');
      if (textarea) textarea.value = preset.prizeMap;
      
      // Update game settings UI
      const maxMainInput = document.getElementById('max-main');
      const mainCountInput = document.getElementById('main-count');
      const hasBonusInput = document.getElementById('has-bonus');
      const maxBonusInput = document.getElementById('max-bonus');
      
      if (maxMainInput) maxMainInput.value = preset.game.maxMain;
      if (mainCountInput) mainCountInput.value = preset.game.mainCount;
      if (hasBonusInput) hasBonusInput.checked = preset.game.hasBonus;
      if (maxBonusInput) maxBonusInput.value = preset.game.maxBonus;
      
      // Trigger game settings change
      const event = new CustomEvent('gameSettingsChanged');
      document.dispatchEvent(event);
      
      updatePrizeMapUI();
      saveSettings();
      
      const toastEvent = new CustomEvent('showToast', { 
        detail: { message: `${preset.name} preset applied`, type: 'success' } 
      });
      document.dispatchEvent(toastEvent);
    });
  }
  
  // Prize input changes
  const inputs = document.querySelectorAll('.prize-input');
  inputs.forEach(input => {
    input.addEventListener('blur', updatePrizeMapFromUI);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        updatePrizeMapFromUI();
      }
    });
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPrizeMapEditor);
} else {
  setTimeout(initPrizeMapEditor, 100);
}

export { initPrizeMapEditor, updatePrizeMapUI, generatePrizeMapTemplate, PRIZE_PRESETS };

