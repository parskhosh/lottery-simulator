// Lottery simulation worker. Shared between dedicated worker threads and
// inline blob workers for offline usage.

function workerBody(scope) {
  'use strict';

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

  function post(message) {
    try {
      scope.postMessage(message);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('Worker postMessage failed:', err);
      }
    }
  }

  function getRandomInt(min, max) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return min + (arr[0] % (max - min + 1));
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

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

  function matchNumbers(a, b) {
    const setA = new Set(a);
    return b.filter((n) => setA.has(n)).length;
  }

  function parsePrizeMap(text) {
    const map = new Map();
    const lines = text.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const [key, value] = line.split('=').map((s) => s.trim());
      if (!key || !value) continue;

      const [main, bonus] = key.split(',').map((s) => parseInt(s));
      const mapKey = `${main || 0},${bonus || 0}`;

      let prize = 0;
      if (value === 'JACKPOT') {
        prize = -1;
      } else if (value === 'FREE_PLAY') {
        prize = 0;
      } else {
        prize = parseInt(value) || 0;
      }

      map.set(mapKey, prize);
    }

    return map;
  }

  function calculatePrize(mainMatches, bonusMatch, prizeMap, ticketCost) {
    if (!prizeMap) return 0;

    const key = `${mainMatches},${bonusMatch ? 1 : 0}`;
    let prize = prizeMap.get(key);

    if (prize === undefined) {
      const key2 = `${mainMatches},0`;
      prize = prizeMap.get(key2);
    }

    if (prize === -1) {
      return 1000000 * 100;
    }

    return prize || 0;
  }

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

  function processBatch() {
    if (!running || paused || canceled) return [];

    const batchSize = hidden
      ? Math.min(settings.pricing.batchSize, 500)
      : settings.pricing.batchSize;
    const rows = [];

    const prizeMap = settings.prizeMap
      ? parsePrizeMap(settings.prizeMap)
      : null;
    const ticketCost = Math.round(settings.pricing.ticketPrice * 100);

    for (let i = 0; i < batchSize; i++) {
      if (ticketQueue.length === 0) {
        ticketQueue.push({
          main: generateNumbers(
            settings.game.maxMain,
            settings.game.mainCount,
            settings.excludedNumbers
          ),
          bonus: settings.game.hasBonus
            ? getRandomInt(1, settings.game.maxBonus)
            : null,
        });
      }

      const ticket = normalizeQueuedTicket(ticketQueue.shift(), settings);
      const matches = matchNumbers(ticket.main, target.main);
      const bonusMatch =
        settings.game.hasBonus && ticket.bonus === target.bonus;

      const prize = calculatePrize(
        matches,
        bonusMatch,
        prizeMap,
        ticketCost
      );
      const net = prize - ticketCost;

      rows.push({
        idx: stats.tickets + i + 1,
        main: ticket.main,
        bonus: ticket.bonus,
        ticket: ticket.main.slice(),
        matches,
        bonusMatch,
        prize,
        cost: ticketCost,
        net,
        day: currentDay,
        type: prize === -1 ? 'jackpot' : matches,
        time: Date.now(),
      });

      stats.spent += ticketCost;
      stats.paid += prize === -1 ? 0 : prize;
      stats.net = stats.paid - stats.spent;
      stats.roi = stats.spent > 0 ? (stats.net / stats.spent) * 100 : 0;

      if (prize === -1) {
        stats.jackpots += 1;
        if (stopOnJackpot) {
          running = false;
          post({ t: 'state', running: false, paused: false });
          post({
            t: 'tick',
            rows,
            stats: { ...stats, rate: 0, elapsed: 0 },
            delta: {
              paid: rows.reduce((sum, r) => sum + r.prize, 0),
              spent: rows.reduce((sum, r) => sum + r.cost, 0),
            },
          });
          return [];
        }
      }

      if (settings.pricing.ticketsPerDay > 0) {
        ticketsToday += 1;
        if (ticketsToday >= settings.pricing.ticketsPerDay) {
          currentDay += 1;
          ticketsToday = 0;
          post({ t: 'day', day: currentDay });
        }
      }

      if (shouldStop()) {
        break;
      }
  }

    stats.tickets += rows.length;

    if (settings.pricing.ticketsPerDay > 0) {
      const daysPassed = Math.floor(
        stats.tickets / settings.pricing.ticketsPerDay
      );
      stats.days = daysPassed;
    }

    return rows;
  }

  function tick() {
    if (!running || paused || canceled) {
      post({ t: 'state', running, paused });
      return;
    }

    const now = Date.now();
    const rows = processBatch();

    if (rows.length === 0) {
      running = false;
      post({ t: 'state', running: false, paused: false });
      return;
    }

    const elapsed = (now - startTime) / 1000;
    const rate = elapsed > 0 ? stats.tickets / elapsed : 0;

    if (settings.eco?.enabled && rate > settings.eco.rateCap) {
      const delay = 1000 / settings.eco.rateCap;
      setTimeout(tick, delay);
      return;
    }

    post({
      t: 'tick',
      rows,
      stats: { ...stats, rate, elapsed },
      delta: {
        paid: rows.reduce((sum, r) => sum + r.prize, 0),
        spent: rows.reduce((sum, r) => sum + r.cost, 0),
      },
    });

    lastTick = now;
    const delay = hidden
      ? Math.max(settings.pricing.uiDelay * 2, 100)
      : settings.pricing.uiDelay;
    setTimeout(tick, delay);
  }

  scope.addEventListener('message', (e) => {
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
        post({ t: 'reset', stats });
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
        if (data.stopOnJackpot !== undefined)
          stopOnJackpot = data.stopOnJackpot;
        if (data.hidden !== undefined) hidden = data.hidden;
        break;
    }

    post({ t: 'state', running, paused });
  });
}

  if (typeof document === 'undefined') {
    workerBody(self);
  }

  function normalizeQueuedTicket(entry, settings) {
    if (!settings) {
      return { main: [], bonus: null };
    }
    if (Array.isArray(entry)) {
      return { main: [...entry], bonus: null };
    }
    if (entry && Array.isArray(entry.main)) {
      return {
        main: [...entry.main],
        bonus: Number.isFinite(entry.bonus) ? entry.bonus : null
      };
    }
    return {
      main: generateNumbers(settings.game.maxMain, settings.game.mainCount, settings.excludedNumbers),
      bonus: settings.game.hasBonus ? getRandomInt(1, settings.game.maxBonus) : null
    };
  }

  const workerSource = `(${workerBody.toString()})(self);`;

class InlineWorker {
  constructor() {
    this.isInline = true;
    this.onmessage = null;
    this.onerror = null;
    this._terminated = false;
    this._messageHandler = null;

    const scope = {
      postMessage: (data) => {
        if (this._terminated) return;
        setTimeout(() => this._emitToMain(data), 0);
      },
      addEventListener: (type, handler) => {
        if (type === 'message') {
          this._messageHandler = handler;
        }
      },
      removeEventListener: (type, handler) => {
        if (type === 'message' && this._messageHandler === handler) {
          this._messageHandler = null;
        }
      }
    };

    try {
      workerBody(scope);
    } catch (err) {
      this._emitError(err);
    }
  }

  _emitToMain(data) {
    if (this._terminated) return;
    if (typeof this.onmessage === 'function') {
      try {
        this.onmessage({ data });
      } catch (err) {
        this._emitError(err);
      }
    }
  }

  _emitError(err) {
    if (typeof this.onerror === 'function') {
      try {
        this.onerror(err);
      } catch (nested) {
        console.error('Inline worker error handler failed:', nested);
      }
    } else {
      console.error('Inline worker error:', err);
    }
  }

  postMessage(message) {
    if (this._terminated || !this._messageHandler) return;
    setTimeout(() => {
      if (this._terminated || !this._messageHandler) return;
      try {
        this._messageHandler({ data: message });
      } catch (err) {
        this._emitError(err);
      }
    }, 0);
  }

  terminate() {
    this._terminated = true;
    this._messageHandler = null;
    this.onmessage = null;
    this.onerror = null;
  }
}

export function createWorkerFromSource() {
  if (typeof Worker === 'function') {
    try {
      const blob = new Blob([workerSource], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);

      const originalTerminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        originalTerminate();
        URL.revokeObjectURL(url);
      };

      return worker;
    } catch (err) {
      console.warn('Failed to create Web Worker, falling back to inline worker:', err);
    }
  } else {
    console.warn('Web Worker API unavailable, using inline worker fallback.');
  }

  return new InlineWorker();
}

export { workerBody };

