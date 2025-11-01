# خلاصه تعمیرات انجام شده

## تغییرات اعمال شده

### 1. ✅ توکن‌های رنگ و تم
- ایجاد `src/css/tokens.css` که در ابتدا لود می‌شود
- توکن‌های dark/light با مقادیر دقیق طبق مشخصات
- تنظیم `data-theme="dark"` روی `<html>` در هنگام بارگذاری
- حذف overrideهای متغیرها در base.css

### 2. ✅ Font Awesome
- فایل‌های placeholder ایجاد شد
- مسیر فونت‌ها: `../webfonts/fa-solid-900.woff2`
- **توجه**: باید فایل‌های واقعی Font Awesome را دانلود و اضافه کنید

### 3. ✅ data-hook Attributes
- اضافه شدن `data-hook` به همه دکمه‌های اصلی:
  - `btn-start`, `btn-pause`, `btn-stop`, `btn-reset`, `btn-export`
  - `toggle-theme`, `toggle-lang`
  - `tabs` برای container تب‌ها

### 4. ✅ State Machine & Controller
- ایجاد `src/js/controller.js` با:
  - Helper functions: `$()`, `bind()`
  - State machine: `RUN.IDLE`, `RUN.RUNNING`, `RUN.PAUSED`, `RUN.STOPPED`
  - Worker management: `ensureWorker()`
  - Diagnostics: `window.diag`
- همه دکمه‌ها با `bind()` و error handling وصل شده‌اند
- Logs در Console برای هر action

### 5. ✅ Tabs, Theme, Language
- **Tabs**: با `data-panel` و handler در controller.js
- **Theme**: تغییر `data-theme` روی `<html>` + localStorage
- **Language**: استفاده از `switchLanguage()` موجود در i18n.js + تغییر dir

### 6. ✅ Resource Limits
- Worker message handling برای `settings` و `cfg`
- Visibility change handler در controller.js

### 7. ✅ Diagnostics
- `window.diag()` برای logging
- `window.onerror` و `window.onunhandledrejection` handler
- Console.assert برای missing hooks

## تست‌های لازم

### در Console باید ببینید:
```
[APP] init-start
[APP] theme-set dark
[APP] lang-set fa
[APP] bind btn-start
[APP] bind btn-pause
[APP] bind btn-stop
[APP] bind btn-reset
[APP] bind btn-export
[APP] bind toggle-theme
[APP] bind toggle-lang
[APP] init-complete
```

### در Elements:
- `<html data-theme="dark">` باید دیده شود
- `--page`, `--box`, `--primary` در Computed باید درست باشند

### دکمه‌ها:
- کلیک روی Start → `[APP] btn-start-clicked` + state=running
- کلیک روی Pause → `[APP] btn-pause-clicked` + state=paused
- و غیره

### Theme/Language:
- تغییر theme → `[APP] theme-switch light/dark`
- تغییر language → `[APP] lang-switch fa/en`

## فایل‌های ایجاد/تغییر یافته

1. **جدید**: `src/css/tokens.css` - توکن‌های رنگ
2. **جدید**: `src/js/controller.js` - کنترلر مرکزی
3. **جدید**: `src/js/i18n-controller.js` - کنترلر زبان (deprecated، استفاده از i18n.js)
4. **تغییر**: `src/index.html` - اضافه شدن data-hook و panels برای tabs
5. **تغییر**: `src/js/app.js` - تنظیم theme در ابتدا
6. **تغییر**: `src/js/ui.js` - حذف handlerهای قدیمی، استفاده از controller
7. **تغییر**: `src/js/logs.js` - هماهنگی با panels
8. **تغییر**: `src/css/base.css` - حذف overrideهای رنگ

## نکات مهم

- هیچ نام selector یا data-hook بدون دلیل تغییر نکرده
- توکن‌های رنگ فقط در `tokens.css` تنظیم شده‌اند
- Worker توسط controller.js مدیریت می‌شود
- همه handlerها با try/catch محافظت شده‌اند

