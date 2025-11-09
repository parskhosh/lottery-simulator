// State management module
const CUSTOM_PRESET_KEY = 'custom';

const GAME_PRESETS = {
  classic6: {
    labelKey: 'classic6',
    game: { maxMain: 49, mainCount: 6, hasBonus: true, maxBonus: 10 },
    pricing: { ticketPrice: 2.0 },
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
  mini5: {
    labelKey: 'mini5',
    game: { maxMain: 35, mainCount: 5, hasBonus: false, maxBonus: 0 },
    pricing: { ticketPrice: 1.0 },
    prizeMap: `5=JACKPOT
4=10000
3=100
2=10`
  },
  megaMillions: {
    labelKey: 'megaMillions',
    game: { maxMain: 70, mainCount: 5, hasBonus: true, maxBonus: 25 },
    pricing: { ticketPrice: 2.0 },
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
    labelKey: 'powerball',
    game: { maxMain: 69, mainCount: 5, hasBonus: true, maxBonus: 26 },
    pricing: { ticketPrice: 2.0 },
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
    labelKey: 'euroMillions',
    game: { maxMain: 50, mainCount: 5, hasBonus: true, maxBonus: 12 },
    pricing: { ticketPrice: 2.5 },
    prizeMap: `5,1=JACKPOT
5,0=1000000
4,1=5000
4,0=500
3,1=200
3,0=50
2,1=20
2,0=10
1,1=8
0,1=4`
  }
};

const BUILT_IN_PRESETS = Object.keys(GAME_PRESETS);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureInt(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function ensureFloat(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

const DEFAULT_SETTINGS = {
  preset: 'classic6',
  game: { ...GAME_PRESETS.classic6.game },
  target: {
    dailyRandom: false,
    dailyBonus: false,
    fixedMain: [],
    fixedBonus: null
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
    ticketPrice: GAME_PRESETS.classic6.pricing.ticketPrice,
    ticketsPerDay: 0,
    totalTickets: 0,
    batchSize: 1000,
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
  prizeMap: GAME_PRESETS.classic6.prizeMap,
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
};

const State = {
  // Run state: 'idle' | 'running' | 'paused' | 'done'
  runState: 'idle',
  
  // Settings
  settings: clone(DEFAULT_SETTINGS),
  
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

function normalizeSettings(raw = {}) {
  const base = clone(DEFAULT_SETTINGS);
  const normalized = {
    ...base,
    ...raw,
    game: { ...base.game, ...(raw.game || {}) },
    target: { ...base.target, ...(raw.target || {}) },
    perf: { ...base.perf, ...(raw.perf || {}) },
    log: { ...base.log, ...(raw.log || {}) },
    pricing: { ...base.pricing, ...(raw.pricing || {}) },
    filters: { ...base.filters, ...(raw.filters || {}) },
    param: { ...base.param, ...(raw.param || {}) },
    cfg: {
      ...base.cfg,
      ...(raw.cfg || {}),
      limit: { ...base.cfg.limit, ...((raw.cfg && raw.cfg.limit) || {}) }
    },
    eco: { ...base.eco, ...(raw.eco || {}) }
  };

  normalized.game.mainCount = ensureInt(normalized.game.mainCount, base.game.mainCount, 1, 20);
  normalized.game.maxMain = ensureInt(normalized.game.maxMain, base.game.maxMain, normalized.game.mainCount, 200);
  normalized.game.hasBonus = Boolean(normalized.game.hasBonus);
  normalized.game.maxBonus = normalized.game.hasBonus
    ? ensureInt(normalized.game.maxBonus, base.game.maxBonus, 1, 99)
    : 0;

  normalized.pricing.ticketPrice = ensureFloat(normalized.pricing.ticketPrice, base.pricing.ticketPrice, 0);
  normalized.pricing.batchSize = ensureInt(normalized.pricing.batchSize, base.pricing.batchSize, 200, 10000);
  normalized.pricing.uiDelay = ensureInt(normalized.pricing.uiDelay, base.pricing.uiDelay, 50, 2000);
  normalized.pricing.ticketsPerDay = ensureInt(normalized.pricing.ticketsPerDay, base.pricing.ticketsPerDay, 0);
  normalized.pricing.totalTickets = ensureInt(normalized.pricing.totalTickets, base.pricing.totalTickets, 0);

  normalized.perf.logCap = ensureInt(normalized.perf.logCap, base.perf.logCap, 1000, 500000);
  normalized.perf.chartCap = ensureInt(normalized.perf.chartCap, base.perf.chartCap, 500, 10000);
  normalized.eco.rateCap = ensureInt(normalized.eco.rateCap, base.eco.rateCap, 10, 10000);
  normalized.param.rngSeed = Number.isFinite(Number(normalized.param.rngSeed))
    ? Number(normalized.param.rngSeed)
    : Date.now();

  const limitKind = normalized.cfg.limit.kind;
  normalized.cfg.limit.kind = ['tickets', 'minutes', 'days'].includes(limitKind) ? limitKind : base.cfg.limit.kind;
  normalized.cfg.limit.value = ensureInt(normalized.cfg.limit.value, base.cfg.limit.value, 0);
  normalized.cfg.stopOnJackpot = Boolean(normalized.cfg.stopOnJackpot);

  normalized.eco.enabled = Boolean(normalized.eco.enabled);

  // Preserve preset if valid, otherwise fallback
  const presetKey = normalized.preset;
  if (presetKey && (presetKey === CUSTOM_PRESET_KEY || BUILT_IN_PRESETS.includes(presetKey))) {
    normalized.preset = presetKey;
  } else {
    normalized.preset = BUILT_IN_PRESETS.includes(base.preset) ? base.preset : CUSTOM_PRESET_KEY;
  }

  if (!raw.prizeMap || String(raw.prizeMap).trim() === '') {
    const preset = GAME_PRESETS[normalized.preset];
    if (preset?.prizeMap) {
      normalized.prizeMap = preset.prizeMap;
    } else {
      normalized.prizeMap = generateDefaultPrizeMap(normalized.game.mainCount, normalized.game.hasBonus);
    }
  } else {
    normalized.prizeMap = String(raw.prizeMap);
  }

  return normalized;
}

// Load settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem('lsim.settings');
    if (saved) {
      const data = JSON.parse(saved);
      State.settings = normalizeSettings(data);
    } else {
      State.settings = normalizeSettings(DEFAULT_SETTINGS);
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
    State.settings = normalizeSettings(DEFAULT_SETTINGS);
  }
}

// Save settings to localStorage
function saveSettings() {
  try {
    State.settings = normalizeSettings(State.settings);
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
  if (!row.time) {
    row.time = Date.now();
  }
  State.purchaseLog.push(row);
  if (State.purchaseLog.length > State.miniLogCap) {
    State.purchaseLog.shift();
  }
  
  // Add to wins log if applicable
  if (row.prize > 0 || row.type === 'jackpot') {
    State.winsLog.push(row);
    if (State.winsLog.length > State.miniLogCap) {
      State.winsLog.shift();
    }
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

function applyGamePreset(key) {
  if (key === CUSTOM_PRESET_KEY) {
    State.settings = normalizeSettings({ ...State.settings, preset: CUSTOM_PRESET_KEY });
    return null;
  }
  
  const preset = GAME_PRESETS[key];
  if (!preset) {
    State.settings = normalizeSettings({ ...State.settings, preset: CUSTOM_PRESET_KEY });
    return null;
  }
  
  const nextSettings = {
    ...State.settings,
    preset: key,
    game: { ...State.settings.game, ...preset.game },
    pricing: preset.pricing
      ? { ...State.settings.pricing, ...preset.pricing }
      : { ...State.settings.pricing },
    prizeMap: preset.prizeMap || generateDefaultPrizeMap(
      preset.game?.mainCount ?? State.settings.game.mainCount,
      preset.game?.hasBonus ?? State.settings.game.hasBonus
    )
  };
  
  State.settings = normalizeSettings(nextSettings);
  return preset;
}

export {
  State,
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  resetSession,
  addPurchaseLog,
  updateChartData,
  generateDefaultPrizeMap,
  GAME_PRESETS,
  DEFAULT_SETTINGS,
  normalizeSettings,
  applyGamePreset
};
  normalized.target.fixedMain = Array.isArray(normalized.target.fixedMain)
    ? normalized.target.fixedMain
        .map((n) => ensureInt(n, 0))
        .filter((n) => n >= 1 && n <= normalized.game.maxMain)
        .slice(0, normalized.game.mainCount)
    : [];
  if (normalized.game.hasBonus) {
    const bonus = ensureInt(normalized.target.fixedBonus, null);
    normalized.target.fixedBonus =
      Number.isFinite(bonus) && bonus >= 1 && bonus <= normalized.game.maxBonus ? bonus : null;
  } else {
    normalized.target.fixedBonus = null;
  }
