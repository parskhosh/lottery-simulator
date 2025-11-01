// Main app initialization
import { initI18n, updateI18n, switchLanguage } from './i18n.js';
import { loadCurrency } from './currency.js';
import { loadSettings, generateDefaultPrizeMap } from './state.js';
import { initUI } from './ui.js';

// Set theme IMMEDIATELY before anything loads
(function setThemeFirst() {
  const savedTheme = localStorage.getItem('lsim.theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

// Load controller after theme is set
import './controller.js'; // Load controller for bindings

// Initialize app
async function init() {
  try {
    // Setup diagnostics
    window.diag = window.diag || ((label, data) => {
      console.log('%c[APP]', 'color:#6EA9FF', label, data || '');
    });
    
    window.diag('init-start');
    
    // Set theme (already set inline, but update from localStorage)
    const savedTheme = localStorage.getItem('lsim.theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    window.diag('theme-set', savedTheme);
    
    // Load saved data
    loadSettings();
    loadCurrency();
    
    // Ensure defaults are applied
    const { State } = await import('./state.js');
    const { saveSettings } = await import('./state.js');
    if (!State.settings.prizeMap || State.settings.prizeMap.trim() === '') {
      const { mainCount, hasBonus } = State.settings.game;
      State.settings.prizeMap = generateDefaultPrizeMap(mainCount, hasBonus);
      saveSettings();
    }
    
    // Initialize i18n
    const savedLang = localStorage.getItem('lsim.locale') || 'fa';
    switchLanguage(savedLang);
    window.diag('lang-set', savedLang);
    
    // Initialize UI
    initUI();
    
    window.diag('init-complete');
    console.log('Lottery Simulator initialized');
  } catch (e) {
    console.error('Initialization error:', e);
    window.diag && window.diag('init-error', e.message);
    alert('Failed to initialize application. Please check console for details.');
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM already ready, but wait a tick for CSS to load
  setTimeout(init, 0);
}

