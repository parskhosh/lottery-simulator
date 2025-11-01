// Currency module - all math in minor units (integers)
const Currency = {
  base: { code: 'USD', sym: '$', minor: 100 },
  sec: { code: 'IRR', sym: '﷼', minor: 1, rate: 1.0 },
  showBoth: false
};

// Format base currency (minor units -> string)
function fmtBase(minor) {
  const major = minor / Currency.base.minor;
  return `${Currency.base.sym}${major.toFixed(2)}`;
}

// Format dual currency
function fmtDual(minor) {
  const baseStr = fmtBase(minor);
  if (!Currency.showBoth || !Currency.sec.code) {
    return baseStr;
  }
  const secMinor = Math.round(minor * Currency.sec.rate);
  const secMajor = secMinor / Currency.sec.minor;
  return `${baseStr} / ${Currency.sec.sym}${secMajor.toLocaleString()}`;
}

// Parse major amount to minor units
function toMinor(major, isBase = true) {
  const unit = isBase ? Currency.base.minor : Currency.sec.minor;
  return Math.round(major * unit);
}

// Convert minor from base to secondary
function toSecondary(minor) {
  return Math.round(minor * Currency.sec.rate);
}

// Load from localStorage
function loadCurrency() {
  try {
    const saved = localStorage.getItem('lsim.currency');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.base) Currency.base = { ...Currency.base, ...data.base };
      if (data.sec) Currency.sec = { ...Currency.sec, ...data.sec };
      if (data.showBoth !== undefined) Currency.showBoth = data.showBoth;
    }
  } catch (e) {
    console.warn('Failed to load currency:', e);
  }
}

// Save to localStorage
function saveCurrency() {
  try {
    localStorage.setItem('lsim.currency', JSON.stringify({
      base: Currency.base,
      sec: Currency.sec,
      showBoth: Currency.showBoth
    }));
  } catch (e) {
    console.warn('Failed to save currency:', e);
  }
}

// Update currency display across UI
function updateCurrencyDisplay() {
  // This will be called from UI module to refresh all currency displays
  const event = new CustomEvent('currencyChanged');
  document.dispatchEvent(event);
}

export { Currency, fmtBase, fmtDual, toMinor, toSecondary, loadCurrency, saveCurrency, updateCurrencyDisplay };

