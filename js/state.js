// State management module
const State = {
  // Run state: 'idle' | 'running' | 'paused' | 'done'
  runState: 'idle',
  
  // Settings
  settings: {
    game: {
      maxMain: 49,
      mainCount: 6,
      hasBonus: true,
      maxBonus: 10
    },
    target: {
      dailyRandom: false,
      dailyBonus: false
    },
    perf: {
      logCap: 50000,
      chartDelay: 200,
      chartTickStep: 100
    },
    log: {
      mode: 'all'
    },
    pricing: {
      ticketPrice: 2.00,
      ticketsPerDay: 0,
      totalTickets: 0,
      batchSize: 2000,
      uiDelay: 200
    },
    filters: {
      rangeMode: 'off',
      ranges: '',
      include: '',
      exclude: '',
      evenOdd: 0,
      maxConsec: 5,
      sumMin: 0,
      sumMax: 0
    },
    prizeMap: '6=JACKPOT\n5,1=1000000\n5,0=100000\n4=5000\n3=100',
    engine: 'full',
    param: {
      probN: 1000000,
      jackpotX: 1000000,
      smallN: 5000,
      smallHitX: 5,
      rngSeed: Date.now()
    },
    cfg: {
      stopOnJackpot: false,
      limit: { kind: 'tickets', value: 0 }
    },
    eco: {
      enabled: false,
      rateCap: 500
    }
  },
  
  // Current session stats
  stats: {
    tickets: 0,
    days: 0,
    jackpots: 0,
    spent: 0,      // base minor
    paid: 0,       // base minor
    net: 0,        // base minor
    roi: 0,        // percentage
    rate: 0,       // tickets/sec
    elapsed: 0     // seconds
  },
  
  // Purchase log (ring buffer in memory)
  purchaseLog: [],
  miniLogCap: 800,
  
  // Wins log
  winsLog: [],
  
  // Charts data
  chartData: {
    pl: [],        // { x: idx, y: net }
    roi: [],       // { x: idx, y: roi }
    daily: [],     // { day: number, pl: number }
    hits: {}       // { 0: count, 1: count, ..., 6: count }
  },
  
  // Ticket queue
  ticketQueue: [],
  
  // Pinned/Preferred/Excluded numbers
  pinnedNumbers: new Set(),
  preferredNumbers: new Set(),
  excludedNumbers: new Set(),
  
  // Current selection
  selectedNumbers: [],
  
  // Current ticket being purchased
  currentTicket: null,
  
  // Current day result
  dayResult: { matches: 0, bonus: false, prize: 0 }
};

// Load settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem('lsim.settings');
    if (saved) {
      const data = JSON.parse(saved);
      // Deep merge to preserve nested structures
      State.settings = {
        ...State.settings,
        ...data,
        game: { ...State.settings.game, ...(data.game || {}) },
        pricing: { ...State.settings.pricing, ...(data.pricing || {}) },
        cfg: {
          ...State.settings.cfg,
          ...(data.cfg || {}),
          limit: { ...State.settings.cfg.limit, ...((data.cfg && data.cfg.limit) || {}) }
        },
        eco: { ...State.settings.eco, ...(data.eco || {}) }
      };
    }
    
    // Ensure default prize map if empty
    if (!State.settings.prizeMap || State.settings.prizeMap.trim() === '') {
      const { mainCount, hasBonus } = State.settings.game;
      State.settings.prizeMap = generateDefaultPrizeMap(mainCount, hasBonus);
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

// Save settings to localStorage
function saveSettings() {
  try {
    localStorage.setItem('lsim.settings', JSON.stringify(State.settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

// Load sessions from localStorage
function loadSessions() {
  try {
    const saved = localStorage.getItem('lsim.sessions');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load sessions:', e);
  }
  return [];
}

// Save sessions to localStorage
function saveSessions(sessions) {
  try {
    localStorage.setItem('lsim.sessions', JSON.stringify(sessions));
  } catch (e) {
    console.warn('Failed to save sessions:', e);
  }
}

// Reset current session
function resetSession() {
  State.stats = {
    tickets: 0,
    days: 0,
    jackpots: 0,
    spent: 0,
    paid: 0,
    net: 0,
    roi: 0,
    rate: 0,
    elapsed: 0
  };
  State.purchaseLog = [];
  State.winsLog = [];
  State.chartData = {
    pl: [],
    roi: [],
    daily: [],
    hits: {}
  };
  State.currentTicket = null;
  State.dayResult = { matches: 0, bonus: false, prize: 0 };
}

// Add to purchase log (ring buffer)
function addPurchaseLog(row) {
  State.purchaseLog.push(row);
  if (State.purchaseLog.length > State.miniLogCap) {
    State.purchaseLog.shift();
  }
  
  // Add to wins log if applicable
  if (row.matches >= 3 || row.type === 'jackpot') {
    State.winsLog.push(row);
  }
  
  // Update chart data
  updateChartData(row);
}

// Update chart data
function updateChartData(row) {
  const { chartData, stats } = State;
  
  // P/L line
  chartData.pl.push({ x: row.idx, y: stats.net });
  if (chartData.pl.length > State.settings.perf.chartCap) {
    chartData.pl.shift();
  }
  
  // ROI line
  chartData.roi.push({ x: row.idx, y: stats.roi });
  if (chartData.roi.length > State.settings.perf.chartCap) {
    chartData.roi.shift();
  }
  
  // Daily bars
  const dayEntry = chartData.daily.find(d => d.day === row.day);
  if (dayEntry) {
    dayEntry.pl += (row.prize - row.cost);
  } else {
    chartData.daily.push({ day: row.day, pl: row.prize - row.cost });
  }
  if (chartData.daily.length > State.settings.perf.chartCap) {
    chartData.daily.shift();
  }
  
  // Hit distribution
  const key = row.bonus ? `${row.matches}b` : `${row.matches}`;
  chartData.hits[key] = (chartData.hits[key] || 0) + 1;
}

// Helper to generate default prize map
function generateDefaultPrizeMap(mainCount = 6, hasBonus = true) {
  const lines = [];
  
  if (hasBonus) {
    lines.push(`${mainCount},1=JACKPOT`);
    lines.push(`${mainCount},0=1000000`);
    for (let m = mainCount - 1; m >= 2; m--) {
      lines.push(`${m},1=100000`);
      lines.push(`${m},0=10000`);
    }
  } else {
    lines.push(`${mainCount}=JACKPOT`);
    for (let m = mainCount - 1; m >= 2; m--) {
      lines.push(`${m}=10000`);
    }
  }
  
  return lines.join('\n');
}

export { State, loadSettings, saveSettings, loadSessions, saveSessions, resetSession, addPurchaseLog, updateChartData, generateDefaultPrizeMap };

