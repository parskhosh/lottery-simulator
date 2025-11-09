import { createWorkerFromSource } from './worker.js';

// Central Controller - State Machine & Event Wiring
// Helper functions
const $ = (s) => document.querySelector(s);

function bind(hook, evt, fn) {
  const el = document.querySelector(`[data-hook="${hook}"]`);
  if (!el) {
    console.error('Missing hook:', hook);
    window.diag && window.diag('bind-fail', hook);
    return false;
  }
  
  // Wrap function for error handling
  const wrappedFn = async (e) => {
    try {
      await fn(e);
    } catch (err) {
      console.error(`Handler error for ${hook}:`, err);
      window.diag && window.diag(`handler-error-${hook}`, err.message);
    }
  };
  
  el.addEventListener(evt, wrappedFn, { passive: false });
  window.diag && window.diag('bind', hook);
  return true;
}

// Diagnostics
window.diag = window.diag || ((label, data) => {
  console.log('%c[APP]', 'color:#6EA9FF', label, data || '');
});

window.onerror = (m, src, ln, col, err) => {
  console.error('GlobalError:', m, src, ln, col, err);
};

window.onunhandledrejection = (e) => {
  console.error('UnhandledPromise:', e.reason);
};

// State Machine
const RUN = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped'
};

let runState = RUN.IDLE;
let worker = null;
let startedAt = 0;
let inlineWarningShown = false;

// State update function
function setState(s) {
  runState = s;
  window.runState = s; // Expose globally
  updateStatusUI(s).catch(e => console.error('updateStatusUI error:', e));
  window.diag && window.diag('state', s);
}

// Update status UI
async function updateStatusUI(state) {
  const statusChip = document.getElementById('status-chip');
  const startBtn = document.getElementById('btn-start');
  const pauseBtn = document.getElementById('btn-pause');
  const stopBtn = document.getElementById('btn-stop');
  
  if (statusChip) {
    // Use i18n for status text
    try {
      const { T } = await import('./i18n.js');
      const stateKey = `status${state.charAt(0).toUpperCase() + state.slice(1)}`;
      const text = T(stateKey) || state;
      statusChip.textContent = text;
    } catch (e) {
      // Fallback
      statusChip.textContent = state;
    }
    statusChip.className = `status-chip ${state}`;
  }
  
  if (startBtn) {
    startBtn.disabled = !(state === RUN.IDLE || state === RUN.PAUSED);
  }
  
  if (pauseBtn) {
    pauseBtn.disabled = state !== RUN.RUNNING && state !== RUN.PAUSED;
  }
  
  if (stopBtn) {
    stopBtn.disabled = !(state === RUN.RUNNING || state === RUN.PAUSED);
  }
}

// Ensure worker exists
async function ensureWorker() {
  if (!worker) {
    try {
      worker = createWorkerFromSource();

      worker.onmessage = ({ data }) => {
        if (data?.t === 'state') {
          setState(data.running ? RUN.RUNNING : (data.paused ? RUN.PAUSED : RUN.IDLE));
        }
        if (data?.t === 'tick') {
          const event = new CustomEvent('workerTick', { detail: data });
          document.dispatchEvent(event);
        }
        if (data?.t === 'reset') {
          const event = new CustomEvent('workerReset', { detail: data });
          document.dispatchEvent(event);
        }
      };
      
      worker.onerror = (e) => {
        console.error('Worker error:', e);
        window.diag && window.diag('worker-error', e.message);
      };
      
      const workerKind = worker?.isInline ? 'inline' : 'blob';
      window.diag && window.diag('worker-created', workerKind);
      if (worker?.isInline && !inlineWarningShown) {
        inlineWarningShown = true;
        try {
          const { T } = await import('./i18n.js');
          const message = T('inlineWorkerFallback') || 'Running without Web Worker – performance may be reduced.';
          const toastEvent = new CustomEvent('showToast', {
            detail: { message, type: 'warn' }
          });
          document.dispatchEvent(toastEvent);
        } catch {
          const toastEvent = new CustomEvent('showToast', {
            detail: { message: 'Running without Web Worker – performance may be reduced.', type: 'warn' }
          });
          document.dispatchEvent(toastEvent);
        }
      }
      
      // Send initial settings after worker is ready
      setTimeout(() => {
        import('./state.js').then(({ State }) => {
          if (worker) {
            worker.postMessage({ t: 'settings', data: State.settings });
            worker.postMessage({
              t: 'cfg',
              data: { stopOnJackpot: State.settings.cfg.stopOnJackpot, hidden: document.hidden }
            });
            window.diag && window.diag('worker-settings-sent');
          }
        }).catch(e => {
          console.error('Failed to load state for worker:', e);
          window.diag && window.diag('worker-settings-error', e.message);
        });
      }, 100);
    } catch (e) {
      console.error('Failed to create worker:', e);
      window.diag && window.diag('worker-create-error', e.message);
      worker = null;
    }
  }
  return worker;
}

// Setup all bindings when DOM is ready
function setupAllBindings() {
  window.diag && window.diag('setup-all-bindings-start');
  
  // Debug: Check if button exists
  const startBtn = document.querySelector('[data-hook="btn-start"]');
  if (!startBtn) {
    console.error('Start button not found with data-hook="btn-start"');
    window.diag && window.diag('start-button-missing');
    // Try alternative selector
    const altBtn = document.getElementById('btn-start');
    if (altBtn) {
      console.warn('Found button by ID but missing data-hook attribute');
      altBtn.setAttribute('data-hook', 'btn-start');
    }
  } else {
    window.diag && window.diag('start-button-found');
  }
  
  // Button handlers
  bind('btn-start', 'click', async (e) => {
    e.preventDefault();
    try {
      if (runState !== RUN.IDLE && runState !== RUN.PAUSED) {
        window.diag && window.diag('btn-start-skipped', runState);
        return;
      }
      
      window.diag && window.diag('btn-start-clicked');
      
      // Check unlimited run
      const { State } = await import('./state.js');
      if (State.settings.pricing.totalTickets === 0 && 
          State.settings.cfg.limit.value === 0) {
        const confirmed = confirm('Unlimited run without limit - this may use significant resources. Continue?');
        if (!confirmed) {
          window.diag && window.diag('btn-start-cancelled');
          return;
        }
      }
      
      worker = await ensureWorker();
      if (!worker) {
        throw new Error('Worker unavailable');
      }
      
      // Send settings
      worker.postMessage({ t: 'settings', data: State.settings });
      worker.postMessage({ t: 'queue', data: State.ticketQueue });
      worker.postMessage({
        t: 'cfg',
        data: { stopOnJackpot: State.settings.cfg.stopOnJackpot, hidden: document.hidden }
      });
      
      // Generate target
      const max = State.settings.game.maxMain;
      const count = State.settings.game.mainCount;
      const useFixed = !State.settings.target.dailyRandom;
      let targetMain = [];
      if (useFixed && Array.isArray(State.settings.target.fixedMain)) {
        targetMain = State.settings.target.fixedMain
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= max)
          .slice(0, count);
      }
      let targetBonus = null;
      if (useFixed && State.settings.game.hasBonus) {
        const b = parseInt(State.settings.target.fixedBonus, 10);
        if (Number.isFinite(b) && b >= 1 && b <= State.settings.game.maxBonus) {
          targetBonus = b;
        }
      }
      let target;
      if (useFixed && targetMain.length === count) {
        target = {
          main: [...targetMain].sort((a, b) => a - b),
          bonus: State.settings.game.hasBonus ? targetBonus : null
        };
      } else {
        const numbers = [];
        for (let i = 1; i <= max; i++) numbers.push(i);
        for (let i = numbers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }
        target = {
          main: numbers.slice(0, count).sort((a, b) => a - b),
          bonus: State.settings.game.hasBonus ? Math.floor(Math.random() * State.settings.game.maxBonus) + 1 : null
        };
      }
      worker.postMessage({ t: 'target', data: target });
      
      worker.postMessage({ t: 'start' });
      setState(RUN.RUNNING);
      startedAt = Date.now();
      
      // Show toast
      const toastEvent = new CustomEvent('showToast', { detail: { message: 'Simulation started', type: 'success' } });
      document.dispatchEvent(toastEvent);
    } catch (err) {
      console.error('Start error:', err);
      window.diag && window.diag('start-error', err.message);
      const toastEvent = new CustomEvent('showToast', { detail: { message: 'Failed to start: ' + err.message, type: 'error' } });
      document.dispatchEvent(toastEvent);
    }
  });

  bind('btn-pause', 'click', async (e) => {
    e.preventDefault();
    try {
      if (runState === RUN.RUNNING) {
        window.diag && window.diag('btn-pause-clicked');
        
        if (!worker) return;
        worker.postMessage({ t: 'pause' });
        setState(RUN.PAUSED);
        
        // Update button text
        const pauseBtn = document.getElementById('btn-pause');
        if (pauseBtn) {
          const { T } = await import('./i18n.js');
          pauseBtn.textContent = T('resume') || 'Resume';
        }
        
        const toastEvent = new CustomEvent('showToast', { detail: { message: 'Simulation paused', type: 'info' } });
        document.dispatchEvent(toastEvent);
      } else if (runState === RUN.PAUSED) {
        // Resume
        window.diag && window.diag('btn-resume-clicked');
        
        if (!worker) return;
        worker.postMessage({ t: 'start' });
        setState(RUN.RUNNING);
        
        // Update button text
        const pauseBtn = document.getElementById('btn-pause');
        if (pauseBtn) {
          const { T } = await import('./i18n.js');
          pauseBtn.textContent = T('pause') || 'Pause';
        }
        
        const toastEvent = new CustomEvent('showToast', { detail: { message: 'Simulation resumed', type: 'success' } });
        document.dispatchEvent(toastEvent);
      }
    } catch (err) {
      console.error('Pause error:', err);
      window.diag && window.diag('pause-error', err.message);
    }
  });

  bind('btn-stop', 'click', (e) => {
    e.preventDefault();
    try {
      window.diag && window.diag('btn-stop-clicked');
      
      if (!worker) return;
      worker.postMessage({ t: 'stop' });
      setState(RUN.STOPPED);
      
      const toastEvent = new CustomEvent('showToast', { detail: { message: 'Simulation stopped', type: 'info' } });
      document.dispatchEvent(toastEvent);
    } catch (err) {
      console.error('Stop error:', err);
      window.diag && window.diag('stop-error', err.message);
    }
  });

  bind('btn-reset', 'click', async (e) => {
    e.preventDefault();
    try {
      if (!confirm('Reset will clear all stats and logs. Continue?')) {
        window.diag && window.diag('btn-reset-cancelled');
        return;
      }
      
      window.diag && window.diag('btn-reset-clicked');
      
      if (worker) {
        worker.postMessage({ t: 'reset' });
      }
      
      // Clear stats and logs (not settings)
      const { resetSession } = await import('./state.js');
      resetSession();
      
      // Trigger reset event for UI
      const event = new CustomEvent('statsReset');
      document.dispatchEvent(event);
      
      // Toast
      const toastEvent = new CustomEvent('showToast', { detail: { message: 'Session reset', type: 'success' } });
      document.dispatchEvent(toastEvent);
      
      setState(RUN.IDLE);
    } catch (err) {
      console.error('Reset error:', err);
      window.diag && window.diag('reset-error', err.message);
    }
  });

  bind('btn-export', 'click', async (e) => {
    e.preventDefault();
    try {
      window.diag && window.diag('btn-export-clicked');
      
      const { exportCSV } = await import('./csv.js');
      await exportCSV();
    } catch (err) {
      console.error('Export error:', err);
      window.diag && window.diag('export-error', err.message);
    }
  });

  // Theme toggle
  const themeEl = document.querySelector('[data-hook="toggle-theme"]');
  if (themeEl) {
    themeEl.addEventListener('change', (e) => {
      try {
        const html = document.documentElement;
        const next = e.target.value;
        html.setAttribute('data-theme', next);
        localStorage.setItem('lsim.theme', next);
        window.diag && window.diag('theme-switch', next);
      } catch (err) {
        console.error('Theme switch error:', err);
      }
    });
    window.diag && window.diag('theme-toggle-bound');
  } else {
    console.error('Theme toggle element not found');
  }

  // Language toggle
  const langEl = document.querySelector('[data-hook="toggle-lang"]');
  if (langEl) {
    langEl.addEventListener('change', async (e) => {
      try {
        const next = e.target.value;
        const { switchLanguage } = await import('./i18n.js');
        switchLanguage(next);
        window.diag && window.diag('lang-switch', next);
      } catch (err) {
        console.error('Language switch error:', err);
        window.diag && window.diag('lang-switch-error', err.message);
      }
    });
    window.diag && window.diag('lang-toggle-bound');
  } else {
    console.error('Language toggle element not found');
  }

  // Tabs
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const to = btn.getAttribute('data-tab');
      
      // Hide all panels
      document.querySelectorAll('[data-panel]').forEach(p => {
        p.hidden = p.getAttribute('data-panel') !== to;
      });
      
      // Update active state
      document.querySelectorAll('[data-tab]').forEach(t => {
        t.classList.toggle('active', t === btn);
      });
      
      window.diag && window.diag('tab-switch', to);
    });
  });

  window.diag && window.diag('setup-all-bindings-complete');
}

// Setup bindings when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAllBindings);
} else {
  // DOM already ready, but wait a tick to ensure all elements exist
  setTimeout(setupAllBindings, 0);
}

// Visibility change handler
document.addEventListener('visibilitychange', () => {
  if (worker) {
    worker.postMessage({ t: 'cfg', data: { hidden: document.hidden } });
    window.diag && window.diag('visibility', document.hidden ? 'hidden' : 'visible');
  }
});

export { RUN, runState, setState, worker, ensureWorker, $, bind };
