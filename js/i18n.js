// Internationalization module
const I18N = {
  fa: {
    title: "شبیه‌ساز لاتاری حرفه‌ای",
    runControls: "کنترل اجرا",
    start: "شروع",
    pause: "توقف موقت",
    stop: "توقف",
    reset: "بازنشانی",
    exportCsv: "خروجی CSV",
    statusIdle: "بیکار",
    statusRunning: "در حال اجرا",
    statusPaused: "متوقف شده",
    statusStopped: "متوقف",
    statusDone: "تمام شده",
    resume: "ادامه",
    ticketsSec: "تیکت/ثانیه",
    stopOnJackpot: "توقف در جکپات",
    runLimit: "حد اجرا",
    tickets: "تیکت",
    minutes: "دقیقه",
    days: "روز",
    resourceSettings: "تنظیمات منابع",
    batchSize: "اندازه دسته",
    uiDelay: "تأخیر رابط",
    maxLogRows: "حد ردیف‌های لاگ",
    chartCap: "حد داده‌های نمودار",
    ecoMode: "حالت اکو",
    rateCap: "حد نرخ",
    gameSettings: "تنظیمات بازی",
    preset: "پیش‌تنظیم",
    classic6: "کلاسیک 6/49",
    mini5: "مینی 5/35",
    custom: "سفارشی",
    megaMillions: "مگا میلیونز",
    powerball: "پاوربال",
    euroMillions: "یورو میلیونز",
    maxMain: "حد بالا",
    mainCount: "تعداد انتخاب",
    hasBonus: "شماره جایزه",
    maxBonus: "حد بالای جایزه",
    ticketPrice: "قیمت تیکت",
    ticketsPerDay: "تیکت/روز",
    totalTickets: "کل تیکت‌ها",
    prizeMap: "نقشه جوایز",
    generate: "تولید خودکار",
    match: "تعداد تطابق",
    bonus: "بونس",
    prize: "جایزه",
    action: "عملیات",
    parse: "تجزیه",
    sync: "همگام‌سازی",
    prizeMapGenerated: "نقشه جوایز تولید شد",
    presetApplied: "پریست اعمال شد",
    inlineWorkerFallback: "اجرای بدون وب‌ورکر انجام می‌شود و ممکن است کندتر باشد.",
    displayLocale: "نمایش و زبان",
    theme: "تم",
    dark: "تاریک",
    light: "روشن",
    language: "زبان",
    persian: "فارسی",
    english: "English",
    currency: "ارز",
    ticketBuilder: "سازنده تیکت",
    lockSelected: "قفل انتخاب‌ها",
    unlockAll: "باز کردن همه",
    quickPick: "انتخاب سریع",
    clear: "پاک کردن",
    addTicket: "افزودن تیکت",
    clearQueue: "پاک کردن صف",
    rangeSelector: "انتخاب محدوده",
    add: "افزودن",
    evenOnly: "فقط زوج",
    oddOnly: "فقط فرد",
    generateTickets: "تولید تیکت",
    ticketQueue: "صف تیکت‌ها",
    analytics: "تحلیل",
    days: "روزها",
    jackpots: "جکپات‌ها",
    spent: "خرج شده",
    paid: "پرداخت شده",
    net: "خالص",
    roi: "ROI",
    charts: "نمودارها",
    profitLoss: "سود/زیان",
    dailyPnL: "سود/زیان روزانه",
    hitDistribution: "توزیع برخورد",
    logs: "لاگ‌ها",
    winsOnly: "فقط بردها",
    purchases: "خریدها",
    wins: "بردها",
    currencySettings: "تنظیمات ارز",
    baseCurrency: "ارز پایه",
    secondaryCurrency: "ارز ثانویه",
    showBoth: "نمایش هر دو",
    save: "ذخیره",
    cancel: "لغو",
    select: "انتخاب",
    pin: "پین",
    prefer: "ترجیح",
    exclude: "حذف",
    clearPinned: "پاک کردن پین‌ها",
    clearPreferred: "پاک کردن ترجیحات",
    clearExcluded: "پاک کردن حذف‌ها",
    logColIndex: "شماره",
    logColType: "وضعیت",
    logColMatches: "تطابق",
    logColPrize: "جایزه",
    logColCost: "هزینه",
    logColNet: "خالص",
    logColTime: "زمان",
    logColNumbers: "شماره‌ها",
    logNoWins: "هنوز بردی ثبت نشده است",
    logNoResults: "داده‌ای برای نمایش وجود ندارد",
    waitingForResult: "در انتظار نتایج...",
    logBonusShort: "بونس",
    logDayShort: "روز",
    logResultJackpot: "جکپات",
    logResultWin: "برد",
    logResultLoss: "باخت",
    logJackpot: "جکپات",
    logCount: "تعداد رکوردها",
    prizeMapHint: "جوایز را به‌صورت لایه‌ای تنظیم کنید و از پریست‌های آماده برای شروع سریع استفاده کنید.",
    prizeMapRaw: "ویرایش دستی جدول",
    prizeMapRawHint: "برای هر سطر از الگوی m[,b]=VALUE استفاده کنید. مقدار JACKPOT یا FREE_PLAY هم پشتیبانی می‌شود.",
    prizeSummaryHint: "با تغییر هر مقدار، لیست بالا و متن پایین هماهنگ خواهند شد.",
    prizeSummaryMain: "ترکیب اصلی",
    prizeSummaryBonus: "بونس",
    prizeSummaryTiers: "سطوح جایزه",
    prizeSummaryFilled: "تعریف شده‌ها",
    prizeMissingHint: "برای این سطح جایزه‌ای تعریف نشده است.",
    prizeMapSynced: "نقشه جوایز به‌روزرسانی شد",
  },
  en: {
    title: "Professional Lottery Simulator",
    runControls: "Run Controls",
    start: "Start",
    pause: "Pause",
    stop: "Stop",
    reset: "Reset",
    exportCsv: "Export CSV",
    statusIdle: "Idle",
    statusRunning: "Running",
    statusPaused: "Paused",
    statusStopped: "Stopped",
    statusDone: "Done",
    resume: "Resume",
    ticketsSec: "tickets/sec",
    stopOnJackpot: "Stop on Jackpot",
    runLimit: "Run Limit",
    tickets: "tickets",
    minutes: "minutes",
    days: "days",
    resourceSettings: "Resource Settings",
    batchSize: "Batch Size",
    uiDelay: "UI Delay",
    maxLogRows: "Max Log Rows",
    chartCap: "Chart Cap",
    ecoMode: "Eco Mode",
    rateCap: "Rate Cap",
    gameSettings: "Game Settings",
    preset: "Preset",
    classic6: "Classic 6/49",
    mini5: "Mini 5/35",
    custom: "Custom",
    megaMillions: "Mega Millions",
    powerball: "Powerball",
    euroMillions: "EuroMillions",
    maxMain: "Max Number",
    mainCount: "Main Count",
    hasBonus: "Has Bonus",
    maxBonus: "Max Bonus",
    ticketPrice: "Ticket Price",
    ticketsPerDay: "Tickets/Day",
    totalTickets: "Total Tickets",
    prizeMap: "Prize Map",
    generate: "Auto Generate",
    match: "Match",
    bonus: "Bonus",
    prize: "Prize",
    action: "Action",
    parse: "Parse",
    sync: "Sync",
    prizeMapGenerated: "Prize map generated",
    presetApplied: "Preset applied",
    inlineWorkerFallback: "Running without Web Worker – performance may be reduced.",
    displayLocale: "Display & Locale",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    language: "Language",
    persian: "فارسی",
    english: "English",
    currency: "Currency",
    ticketBuilder: "Ticket Builder",
    lockSelected: "Lock Selected",
    unlockAll: "Unlock All",
    quickPick: "Quick Pick",
    clear: "Clear",
    addTicket: "Add Ticket",
    clearQueue: "Clear Queue",
    rangeSelector: "Range Selector",
    add: "Add",
    evenOnly: "Even Only",
    oddOnly: "Odd Only",
    generateTickets: "Generate Tickets",
    ticketQueue: "Ticket Queue",
    analytics: "Analytics",
    days: "Days",
    jackpots: "Jackpots",
    spent: "Spent",
    paid: "Paid",
    net: "Net",
    roi: "ROI",
    charts: "Charts",
    profitLoss: "Profit/Loss",
    dailyPnL: "Daily P&L",
    hitDistribution: "Hit Distribution",
    logs: "Logs",
    winsOnly: "Wins Only",
    purchases: "Purchases",
    wins: "Wins",
    currencySettings: "Currency Settings",
    baseCurrency: "Base Currency",
    secondaryCurrency: "Secondary Currency",
    showBoth: "Show Both",
    save: "Save",
    cancel: "Cancel",
    select: "Select",
    pin: "Pin",
    prefer: "Prefer",
    exclude: "Exclude",
    clearPinned: "Clear Pinned",
    clearPreferred: "Clear Preferred",
    clearExcluded: "Clear Excluded",
    logColIndex: "#",
    logColType: "Result",
    logColMatches: "Matches",
    logColPrize: "Prize",
    logColCost: "Cost",
    logColNet: "Net",
    logColTime: "Time",
    logColNumbers: "Numbers",
    logNoWins: "No winning tickets yet",
    logNoResults: "No entries match the filters",
    waitingForResult: "Waiting for draw...",
    logBonusShort: "Bonus",
    logDayShort: "Day",
    logResultJackpot: "Jackpot",
    logResultWin: "Win",
    logResultLoss: "Loss",
    logJackpot: "Jackpot",
    logCount: "Rows",
    prizeMapHint: "Review your payout tiers here and jump-start real lotteries with ready-made presets.",
    prizeMapRaw: "Advanced editor",
    prizeMapRawHint: "Use the format m[,b]=VALUE for each line. JACKPOT and FREE_PLAY are accepted keywords.",
    prizeSummaryHint: "Any changes you make stay in sync with the raw text below.",
    prizeSummaryMain: "Main picks",
    prizeSummaryBonus: "Bonus",
    prizeSummaryTiers: "Prize tiers",
    prizeSummaryFilled: "Configured",
    prizeMissingHint: "No payout configured yet for this tier.",
    prizeMapSynced: "Prize map updated",
  }
};

let currentLang = 'fa';
let currentDir = 'rtl';

// Translation function
function T(key) {
  return I18N[currentLang]?.[key] || key;
}

// Update all i18n elements
function updateI18n() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentDir;
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = T(key);
    if (text) {
      if (el.tagName === 'INPUT' && el.type === 'text' || el.tagName === 'INPUT' && el.placeholder) {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    }
  });
  
  // Update title
  document.title = T('title');
}

// Switch language
function switchLanguage(lang) {
  try {
    currentLang = lang;
    currentDir = lang === 'fa' ? 'rtl' : 'ltr';
    
    // Update HTML attributes
    document.documentElement.lang = lang;
    document.documentElement.dir = currentDir;
    
    // Update UI
    updateI18n();
    
    // Save to localStorage
    localStorage.setItem('lsim.locale', lang);
    localStorage.setItem('lsim.dir', currentDir);
    
    // Trigger language change event
    const event = new CustomEvent('languageChanged', { detail: { lang, dir: currentDir } });
    document.dispatchEvent(event);
  } catch (e) {
    console.error('Language switch error:', e);
    throw e;
  }
}

// Initialize from localStorage
function initI18n() {
  const savedLang = localStorage.getItem('lsim.locale') || 'fa';
  const savedDir = localStorage.getItem('lsim.dir') || 'rtl';
  switchLanguage(savedLang);
}

export { I18N, T, switchLanguage, initI18n, updateI18n, currentLang };
