# AeroSense — Handoff Prompt (paste into a new chat)

You are continuing work on **AeroSense**, a production-quality, no-backend **PWA** (Environmental Intelligence dashboard). Stack: **vanilla HTML/CSS/JS (ES modules)**, Open-Meteo weather + air-quality APIs, Leaflet + OpenStreetMap, Chart.js, service worker, localStorage. No frameworks, no build step. Designed for GitHub Pages but I run it locally on **a local http server** (modules + service worker require http, not file://).

## Project location & structure
- Root: `index.html`, `manifest.json`, `service-worker.js`, `README.md`
- `pages/`: `radar.html`, `insights.html`, `alerts.html`, `settings.html`
- `css/`: `main.css` (layout + components + responsive), `light.css`, `dark.css`, `animations.css`
- `js/`: `app.js` (home controller), `weather.js`, `aqi.js`, `radar.js`, `insights.js`, `alerts.js`, `settings.js`, `storage.js` (localStorage wrapper, default export `Storage`), `utils.js` (helpers incl. `WMO_CODES`, `getWeatherInfo`, `getAQILabel`, `getUVLabel`, `calcAeroScore`, `el/qs/qsa`, `buildGaugeRing`), `nav.js` (shared: PNG logo injection, theme toggle, dropdowns, alerts badge — loads on every page as a module IIFE)
- `assets/`: app icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — paper-airplane mark)

## Important environment notes (read before editing)
- **Service worker caching:** `service-worker.js` has `CACHE_NAME` (currently `aerosense-v1.5.0`) and `BASE = '/aerosense'` (GitHub Pages path). It is cache-first for the app shell, so **after ANY HTML/CSS/JS change you must bump the cache version** and hard-refresh (Ctrl+Shift+R) or it serves stale files. To fully reset: DevTools → Application → Service Workers → Unregister, then reload.
- ES modules: a syntax error in any module silently kills the whole module (page looks static but nothing is interactive). Always validate JS with `node --check` after editing.
- The app boots each module via a `DOMContentLoaded`/readyState guard at the bottom of the file.

## What was completed in the previous session
1. Replaced the old inline SVG logo with the new app icon across all pages (sidebar, mobile topbar, loading screen, settings footer/about card) + added a real `<link rel="icon">` favicon.
2. Fixed the truncated settings gear SVG icon everywhere.
3. Mobile: horizontal-overflow hardening; restored an accidentally-missing chunk of `main.css` (`.hidden` utility + tablet/desktop media queries) that had broken desktop layout.
4. Light theme: improved contrast on settings segmented buttons; made unit selectors equal width/aligned.
5. Alerts page: fixed a **truncated `alerts.js`** that broke tabs + notifications; made AQI/UV alerts always render so every tab has content.
6. Home page: added a **change-location** button in the hero (opens city-search modal); redesigned the **AeroScore card** (big donut + 5-factor breakdown bars + advisory line); rendered the previously-blank **7-day AQI chart** (`#home-aqi-chart`, Chart.js); made the **alerts "3" badge real and clearable** — it now reflects active alerts and clears once Alerts is opened (seen-signature in localStorage key `aerosense_alerts_seen_sig`, handled in `app.js`, `nav.js`, `alerts.js`).

## Pending / next work
### A) Radar map page (`pages/radar.html`, `js/radar.js`) — NOT yet done
- Some layer tabs (Rain/Clouds/Wind/AQI/Temperature) don't do anything when selected; only Rain (RainViewer) and a base layer are wired. Decide/define what each layer should display, wire the toggles, and the timeline slider + "rain expected in" readout.

### B) Replace emoji icons with SVGs (I will provide the SVGs)
- I'll supply **SVGs** (not PNGs). Plan: create `assets/icons/`, drop SVGs named per the list below, add a helper `icon(name)` in `utils.js` returning `<img class="ic" src="<base>assets/icons/<name>.svg" alt="">` (handle `../` for pages), a weather-code→icon-name map reusing `WMO_CODES`, swap emoji usages in the render functions, add `.ic{width:1.2em;height:1.2em;vertical-align:middle}`, add the folder to the SW `APP_SHELL`, and bump the cache. Ship incrementally: weather → alerts → settings → activities.

#### Emoji → icon-name mapping
Weather (WMO codes, `js/utils.js` + `js/nav.js`):
- ☀️ Clear Sky → `wx-clear`
- 🌤 Mainly Clear → `wx-mostly-clear`
- ⛅ Partly Cloudy → `wx-partly-cloudy`
- ☁️ Overcast → `wx-cloudy`
- 🌫 Fog / Rime → `wx-fog`
- 🌦 Drizzle / Light Showers → `wx-drizzle`
- 🌧 Rain / Showers → `wx-rain`
- 🌨 Snow Grains / Snow Showers → `wx-snow-light`
- ❄️ Snow / Heavy Snow → `wx-snow`
- ⛈ Thunderstorm / Hail → `wx-thunderstorm`
- 🌡 generic temp fallback → `wx-thermometer`

Sun (home):
- 🌅 Sunrise → `sun-sunrise`
- 🌇 Sunset → `sun-sunset`

Alerts (`js/alerts.js`, `js/nav.js`):
- 🌧 Rain alert → `alert-rain`
- 🌦 Moderate/Light rain → `alert-rain-light`
- 💨 Wind alert → `alert-wind`
- ☀️ UV alert → `alert-uv`
- 🌫 AQI alert → `alert-aqi`
- 🌿 Air-quality (leaf) → `alert-aqi-leaf`
- ⛈ Severe weather → `alert-severe`
- 💧 Rain Alerts (settings row) → `alert-droplet`
- 📅 time/date → `ui-calendar`
- 📍 location → `ui-pin`
- 💡 advice/tip → `ui-tip`
- 😷 health advisory (insights) → `health-mask`

Outdoor activities (`getOutdoorRecs` in `js/utils.js`):
- 🚶 Walking → `act-walking`
- 🏃 Running → `act-running`
- 🚴 Cycling → `act-cycling`
- ⛹️ Outdoor Sports → `act-sports`
- 🧺 Picnic → `act-picnic`

Settings rows (`pages/settings.html`):
- 🎨 Theme → `set-theme`
- ⛅ Full Screen Weather → `set-fullscreen`
- ✨ Dynamic Animations → `set-animations`
- 🌡 Temperature unit → `unit-temperature`
- 💨 Wind unit → `unit-wind`
- 🔵 Pressure unit → `unit-pressure`
- 👁 Distance & Visibility → `unit-visibility`
- 📍 Default Location → `set-location`
- 🔄 Update Frequency → `set-refresh`
- 🌐 Language / Data Sources → `set-globe`
- 🔒 Permissions → `set-lock`
- 📄 Privacy Policy → `set-document`
- 🗑 Clear Cached Data → `set-trash`
- 📱 App Version → `set-device`
- ⭐ Rate AeroSense → `set-star`
- ℹ️ About AeroSense → `set-info`

Misc:
- ☁️ Install prompt → `ui-cloud`
- ✕ dismiss → keep as text/SVG (no icon needed)

## How to work
- Make targeted edits, validate with `node --check`, bump the SW cache version on any asset change, and remind me to hard-refresh.
- Keep the AeroSense design language; prefer consistency over inventing new UI.
- Start with: **(A) radar map layers** unless I say otherwise. For **(B)** I'll hand you the SVGs first.
