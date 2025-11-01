// Web Worker - Lottery Engine
let settings = null;
let ticketQueue = [];
let target = { main: [], bonus: null };
let running = false;
let paused = false;
let stopOnJackpot = false;
let hidden = false;
let stats = { tickets: 0, days: 0, jackpots: 0, spent: 0, paid: 0 };
let currentDay = 0;
let ticketsToday = 0;
let startTime = 0;
let lastTick = 0;
let canceled = false;

// RNG
function getRandomInt(min, max) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return min + (arr[0] % (max - min + 1));
  }
  // Fallback
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate unique numbers
function generateNumbers(max, count, exclude = new Set()) {
  const available = [];
  for (let i = 1; i <= max; i++) {
    if (!exclude.has(i)) available.push(i);
  }
  
  const result = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = getRandomInt(0, available.length - 1);
    result.push(available[idx]);
    available.splice(idx, 1);
  }
  
  return result.sort((a, b) => a - b);
}

// Match numbers
function matchNumbers(a, b) {
  const setA = new Set(a);
  return b.filter(n => setA.has(n)).length;
}

// Parse prize map
function parsePrizeMap(text) {
  const map = new Map();
  const lines = text.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    const [key, value] = line.split('=').map(s => s.trim());
    if (!key || !value) continue;
    
    const [main, bonus] = key.split(',').map(s => parseInt(s));
    const mapKey = `${main || 0},${bonus || 0}`;
    
    let prize = 0;
    if (value === 'JACKPOT') {
      prize = -1; // Special marker
    } else if (value === 'FREE_PLAY') {
      prize = 0;
    } else {
      prize = parseInt(value) || 0;
    }
    
    map.set(mapKey, prize);
  }
  
  return map;
}

// Calculate prize
function calculatePrize(mainMatches, bonusMatch, prizeMap, ticketCost) {
  if (!prizeMap) return 0;
  
  const key = `${mainMatches},${bonusMatch ? 1 : 0}`;
  let prize = prizeMap.get(key);
  
  if (prize === undefined) {
    // Try with bonus=0
    const key2 = `${mainMatches},0`;
    prize = prizeMap.get(key2);
  }
  
  if (prize === -1) {
    // Jackpot
    return 1000000 * 100; // 1M in base minor units
  }
  
  return prize || 0;
}

// Check stop conditions
function shouldStop() {
  if (canceled) return true;
  
  if (!settings?.cfg?.limit) return false;
  
  const limit = settings.cfg.limit;
  if (limit.value === 0) return false;
  
  if (limit.kind === 'tickets') {
    return stats.tickets >= limit.value;
  }
  
  if (limit.kind === 'minutes') {
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    return elapsed >= limit.value;
  }
  
  if (limit.kind === 'days') {
    return stats.days >= limit.value;
  }
  
  return false;
}

// Process batch
function processBatch() {
  if (!running || paused || canceled) return [];
  
  const batchSize = hidden ? Math.min(settings.pricing.batchSize, 500) : settings.pricing.batchSize;
  const rows = [];
  const game = settings.game;
  const cost = Math.round(settings.pricing.ticketPrice * 100); // base minor
  
  const prizeMap = parsePrizeMap(settings.prizeMap);
  
  for (let i = 0; i < batchSize && !shouldStop(); i++) {
    // Generate winning numbers (daily target)
    if (settings.target.dailyRandom && ticketsToday === 0) {
      target.main = generateNumbers(game.maxMain, game.mainCount);
      if (game.hasBonus) {
        target.bonus = getRandomInt(1, game.maxBonus);
      }
    }
    
    // Generate ticket (from queue or random)
    let ticket;
    if (ticketQueue.length > 0) {
      ticket = ticketQueue.shift();
    } else {
      ticket = generateNumbers(game.maxMain, game.mainCount);
    }
    
    // Match
    const mainMatches = matchNumbers(ticket, target.main);
    const bonusMatch = game.hasBonus && target.bonus !== null ? ticket.includes(target.bonus) : false;
    
    // Calculate prize
    const prize = calculatePrize(mainMatches, bonusMatch, prizeMap, cost);
    const isJackpot = prize >= 1000000 * 100 || mainMatches === game.mainCount;
    
    // Update day
    ticketsToday++;
    if (settings.pricing.ticketsPerDay > 0 && ticketsToday >= settings.pricing.ticketsPerDay) {
      ticketsToday = 0;
      currentDay++;
    }
    
    // Create row
    const row = {
      idx: stats.tickets + i + 1,
      matches: mainMatches,
      bonus: bonusMatch,
      prize: isJackpot ? (1000000 * 100) : prize,
      cost: cost,
      day: currentDay,
      time: Date.now(),
      type: isJackpot ? 'jackpot' : (mainMatches >= 3 ? 'small' : 'loss'),
      ticket: [...ticket] // Clone ticket array
    };
    
    rows.push(row);
    
    // Update stats
    stats.spent += cost;
    stats.paid += row.prize;
    
    if (isJackpot) {
      stats.jackpots++;
      if (stopOnJackpot) {
        canceled = true;
        break;
      }
    }
    
    // Stop if limit reached
    if (shouldStop()) {
      break;
    }
  }
  
  stats.tickets += rows.length;
  
  // Check day increment
  if (settings.pricing.ticketsPerDay > 0) {
    const daysPassed = Math.floor(stats.tickets / settings.pricing.ticketsPerDay);
    stats.days = daysPassed;
  }
  
  return rows;
}

// Main loop
function tick() {
  if (!running || paused || canceled) {
    self.postMessage({ t: 'state', running, paused });
    return;
  }
  
  const now = Date.now();
  const rows = processBatch();
  
  if (rows.length === 0) {
    running = false;
    self.postMessage({ t: 'state', running: false, paused: false });
    return;
  }
  
  // Calculate rate
  const elapsed = (now - startTime) / 1000;
  const rate = elapsed > 0 ? stats.tickets / elapsed : 0;
  
  // Apply eco mode rate cap
  if (settings.eco?.enabled && rate > settings.eco.rateCap) {
    const delay = 1000 / settings.eco.rateCap;
    setTimeout(tick, delay);
    return;
  }
  
  // Send update
  self.postMessage({
    t: 'tick',
    rows,
    stats: { ...stats, rate, elapsed },
    delta: {
      paid: rows.reduce((sum, r) => sum + r.prize, 0),
      spent: rows.reduce((sum, r) => sum + r.cost, 0)
    }
  });
  
  lastTick = now;
  
  // Schedule next tick
  const delay = hidden ? Math.max(settings.pricing.uiDelay * 2, 100) : settings.pricing.uiDelay;
  setTimeout(tick, delay);
}

// Message handler
self.addEventListener('message', (e) => {
  const { t, data } = e.data;
  
  switch (t) {
    case 'start':
      if (!running) {
        running = true;
        paused = false;
        canceled = false;
        startTime = Date.now();
        lastTick = startTime;
        currentDay = 0;
        ticketsToday = 0;
        tick();
      } else if (paused) {
        paused = false;
        tick();
      }
      break;
      
    case 'pause':
      paused = true;
      break;
      
    case 'stop':
      running = false;
      paused = false;
      canceled = true;
      break;
      
    case 'reset':
      running = false;
      paused = false;
      canceled = true;
      stats = { tickets: 0, days: 0, jackpots: 0, spent: 0, paid: 0 };
      currentDay = 0;
      ticketsToday = 0;
      self.postMessage({ t: 'reset', stats });
      break;
      
    case 'settings':
      settings = data;
      break;
      
    case 'queue':
      ticketQueue = data || [];
      break;
      
    case 'target':
      target = data;
      break;
      
    case 'cfg':
      if (data.stopOnJackpot !== undefined) stopOnJackpot = data.stopOnJackpot;
      if (data.hidden !== undefined) hidden = data.hidden;
      break;
  }
  
  self.postMessage({ t: 'state', running, paused });
});

