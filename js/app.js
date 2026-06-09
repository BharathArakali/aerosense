/* ============================================================
   AeroSense – app.js
   Main application controller – Home page
   ============================================================ */

import Storage from './storage.js';
import { fetchWeather, estimateRainArrival, windDirLabel } from './weather.js';
import { fetchAQI, getHealthAdvisory } from './aqi.js';
import { checkAndFireAlertNotifications } from './notify.js';
import COUNTRIES, { findCountry } from './countries.js';
import {
  getWeatherInfo, getAQILabel, getUVLabel,
  calcAeroScore, getAeroScoreLabel,
  calcComfortScore, getComfortLabel,
  getOutdoorRecs,
  convertTemp, tempUnit, convertWind, windUnit,
  convertPressure, pressureUnit, convertDistance, distanceUnit,
  formatHour, formatDay, formatSunTime, timeAgo,
  reverseGeocode, geocode, detectCountry,
  el, qs, qsa, debounce,
  buildGaugeRing, buildSparkline,
  calcHistoricalNormals, percentDiff,
} from './utils.js';

// ---- State ----
let state = {
  weather: null,
  aqi: null,
  location: null,
  locationName: 'Locating...',
  settings: null,
  refreshTimer: null,
  lastRefresh: null,
  isOnline: navigator.onLine,
  isFullscreen: false,
};

// ---- Init ----
async function init() {
  state.settings = Storage.getSettings();
  applyTheme(state.settings.theme);
  setupEventListeners();
  setupOfflineDetection();
  setupInstallPrompt();

  // Only show the loading overlay if there is nothing cached to show yet
  const hasCachedData = !!(Storage.getCachedWeather() && Storage.getCachedLocation());
  if (!hasCachedData) showLoading('Initializing AeroSense...');

  await loadData();
  hideLoading();
  scheduleRefresh();
  updateLastRefreshDisplay();
}

// ---- Theme ----
function applyTheme(theme) {
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // Sync settings buttons if on settings page
  syncThemeButtons(theme);
}

function syncThemeButtons(theme) {
  qsa('.theme-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (
      theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme
    ));
  });
}

// ---- Data Loading ----
async function loadData(forceRefresh = false) {
  const cw         = Storage.getCachedWeather();
  const ca         = Storage.getCachedAQI();
  const cachedLoc  = Storage.getCachedLocation();

  // ── STEP 1: Instant cache-first render ────────────────────────────
  // If we have cached data paint it immediately so the user sees content
  // at once rather than staring at a spinner while the network is hit.
  // Skip when forceRefresh=true (e.g. city change) to avoid briefly showing
  // stale data for the wrong location.
  if (!forceRefresh && cw && cachedLoc) {
    state.weather       = cw.data;
    state.aqi           = ca?.data ?? null;
    state.location      = cachedLoc;
    state.locationName  = cachedLoc.name || 'Your Location';
    state.lastRefresh   = cw.ts;
    hideLoading();
    renderAll();

    // Cache is still fresh — skip the network call entirely
    const cacheAge  = Date.now() - cw.ts;
    const refreshMs = (state.settings.updateFrequency || 10) * 60 * 1000;
    if (!forceRefresh && cacheAge < refreshMs) {
      updateLastRefreshDisplay();
      return;
    }
  }

  // ── STEP 2: Resolve coordinates ───────────────────────────────────
  let loc = cachedLoc;

  if (!loc) {
    // Only attempt GPS if we genuinely have no cached location.
    // forceRefresh bypasses the cache-freshness check above but must NOT
    // trigger a new GPS fix when the caller has already set a location
    // (e.g. selectCity stores the chosen city before calling loadData).
    try {
      setLoadingText('Getting your location...');
      loc = await getUserLocation();
      Storage.cacheLocation(loc);
      // First-launch: detect country for Browse-by-Country search seed
      if (!Storage.getUserCountry()) {
        detectCountry(loc.lat, loc.lon).then(c => { if (c) Storage.setUserCountry(c); });
      }
    } catch {
      if (!cw) {
        // No cache, no GPS — let the user search manually
        showCitySearch();
        return;
      }
      // GPS failed but cached data is available — render it
      state.weather     = cw.data;
      state.aqi         = ca?.data ?? null;
      state.lastRefresh = cw.ts;
      // Re-persist location from memory if we had cleared it (e.g. refresh button)
      if (state.location) Storage.cacheLocation(state.location);
      hideLoading();
      renderAll();
      updateLastRefreshDisplay();
      return;
    }
  }

  state.location = loc;

  // Resolve a display name without blocking the weather fetch.
  // Update the header text the moment geocoding returns.
  if (loc.name) {
    state.locationName = loc.name;
  } else {
    state.locationName = 'Your Location';
    reverseGeocode(loc.lat, loc.lon).then(name => {
      state.locationName = name;
      loc.name = name;
      Storage.cacheLocation(loc);
      qsa('.hero-location-name').forEach(e => { e.textContent = name; });
    });
  }

  // ── STEP 3: Fetch fresh data in the background ────────────────────
  try {
    const [weather, aqiData] = await Promise.all([
      fetchWeather(loc.lat, loc.lon),
      fetchAQI(loc.lat, loc.lon),
    ]);
    state.weather = weather;
    state.aqi     = aqiData;
    Storage.cacheWeather(weather);
    Storage.cacheAQI(aqiData);
    state.lastRefresh = Date.now();

    Storage.appendHistory({
      temp:     weather.current.temp,
      aqi:      aqiData.current.aqi,
      humidity: weather.current.humidity,
      wind:     weather.current.windSpeed,
    });
    hideOfflineBanner();
    checkAndFireAlertNotifications(weather, aqiData);
  } catch (err) {
    console.warn('[AeroSense] Fetch failed, using cache:', err);
    if (!cw) {
      showError('Unable to load weather data. Please check your connection.');
      return;
    }
    showOfflineBanner();
  }

  hideLoading();   // no-op if already hidden via cache path
  renderAll();
  updateLastRefreshDisplay();
}

// ---- Geolocation ----
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    // enableHighAccuracy: false  → uses WiFi/cell-tower fix (~200–500 ms vs 5–10 s for GPS)
    // maximumAge: 600000         → accept a cached GPS fix up to 10 min old (no extra wait)
    // timeout: 5000              → give up and fall back to cache after 5 s
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
    );
  });
}

// ---- Render All ----
// Critical path renders first (above-the-fold, user-facing content).
// Heavy/below-the-fold renders are deferred to idle time so they don't
// block the initial paint.
function renderAll() {
  if (!state.weather) return;

  // ── Critical: render immediately ─────────────────────────────────
  renderHero();
  renderMetricsGrid();
  renderHourlyForecast();
  renderRainForecast();
  renderDailyForecast();
  renderHealthAdvisory();
  updateAlertsCount();

  // ── Deferred: schedule during browser idle time ───────────────────
  const deferred = () => {
    renderAQIPanel();
    renderScores();
    renderHomeAqiChart();
    renderTodayVsNormal();
    renderSunriseSunset();
    renderOutdoorRecs();
    renderSavedPlaces();
    renderInstallPrompt();
    animateWeatherBackground();
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(deferred, { timeout: 2000 });
  } else {
    setTimeout(deferred, 0);
  }
}

// ---- Hero Card ----
function renderHero() {
  const { weather, aqi, locationName, settings } = state;
  const { current, daily } = weather;
  const info = getWeatherInfo(current.weatherCode, current.isDay);
  const units = settings.units;

  const tempVal = convertTemp(current.temp, units.temperature);
  const feelsVal = convertTemp(current.feelsLike, units.temperature);
  const tUnit = tempUnit(units.temperature);
  const windVal = convertWind(current.windSpeed, units.wind);
  const wUnit = windUnit(units.wind);

  // Hero temp
  qsa('.hero-temp-val').forEach(el => el.textContent = `${tempVal}${tUnit}`);
  qsa('.hero-condition-text').forEach(el => el.textContent = info.desc);
  qsa('.hero-condition-icon').forEach(el => el.textContent = info.icon);
  qsa('.hero-feels-val').forEach(el => el.textContent = `Feels like ${feelsVal}${tUnit}`);
  qsa('.hero-location-name').forEach(el => {
    const t = el.querySelector('.hero-location-name-text');
    if (t) t.textContent = locationName; else el.textContent = locationName;
  });
  qsa('.hero-updated').forEach(el => el.textContent = `${timeAgo(current.timestamp)}`);

  // Metrics row in hero
  const humEl = qs('.hero-humidity'); if (humEl) humEl.textContent = `${current.humidity}%`;
  const windEl = qs('.hero-wind'); if (windEl) windEl.textContent = `${windVal} ${wUnit}`;
  const pressEl = qs('.hero-pressure'); if (pressEl) pressEl.textContent = `${convertPressure(current.pressure, units.pressure)} ${pressureUnit(units.pressure)}`;
  const visEl = qs('.hero-visibility'); if (visEl) visEl.textContent = `${convertDistance(current.visibility, units.distance)} ${distanceUnit(units.distance)}`;

  // Background based on weather condition
  qsa('.hero-card-bg').forEach(bg => {
    bg.className = 'hero-card-bg ' + info.bg;
    if (!current.isDay) bg.classList.add('night');
  });
}

// ---- Metrics Grid ----
function renderMetricsGrid() {
  const { weather, aqi, settings } = state;
  const { current } = weather;
  const units = settings.units;
  const aqiInfo = getAQILabel(aqi?.current.aqi || 0);
  const uvInfo = getUVLabel(current.uvIndex);

  const metrics = [
    {
      id: 'metric-aqi',
      label: 'AQI', labelIcon: '🌿',
      value: aqi?.current.aqi || '--',
      sub: aqiInfo.label,
      color: aqiInfo.color,
      sparkValues: aqi?.hourlyAqi.slice(0,12).map(h => h.aqi),
    },
    {
      id: 'metric-humidity',
      label: 'Humidity', labelIcon: '💧',
      value: `${current.humidity}%`,
      sub: current.humidity < 30 ? 'Dry' : current.humidity > 70 ? 'Humid' : 'Comfortable',
      color: '#3b82f6',
      sparkValues: weather.hourly.slice(0,12).map(h => h.humidity),
    },
    {
      id: 'metric-wind',
      label: 'Wind', labelIcon: '💨',
      value: `${convertWind(current.windSpeed, units.wind)}`,
      sub: `${windUnit(units.wind)} · ${windDirLabel(current.windDir)}`,
      color: '#8b5cf6',
      sparkValues: weather.hourly.slice(0,12).map(h => h.windSpeed),
    },
    {
      id: 'metric-pressure',
      label: 'Pressure', labelIcon: '🌡️',
      value: `${convertPressure(current.pressure, units.pressure)}`,
      sub: pressureUnit(units.pressure),
      color: '#6366f1',
      sparkValues: null,
    },
    {
      id: 'metric-visibility',
      label: 'Visibility', labelIcon: '👁️',
      value: `${convertDistance(current.visibility, units.distance)}`,
      sub: distanceUnit(units.distance),
      color: '#0ea5e9',
      sparkValues: null,
    },
    {
      id: 'metric-uv',
      label: 'UV Index', labelIcon: '☀️',
      value: current.uvIndex,
      sub: uvInfo.label,
      color: uvInfo.color,
      sparkValues: weather.hourly.slice(0,12).map(h => h.uvIndex),
    },
  ];

  const grid = el('metrics-grid');
  if (!grid) return;
  grid.innerHTML = metrics.map(m => `
    <div class="metric-card card-lift" id="${m.id}">
      <div class="mc-label"><span class="mc-label-icon">${m.labelIcon}</span> ${m.label}</div>
      <div class="mc-value" style="color:${m.color}">${m.value}</div>
      <div class="mc-sub">${m.sub}</div>
      ${m.sparkValues ? `<div class="mc-sparkline" id="${m.id}-spark"></div>` : ''}
    </div>
  `).join('');

  // Build sparklines
  metrics.forEach(m => {
    if (m.sparkValues) {
      const sparkEl = el(`${m.id}-spark`);
      if (sparkEl) buildSparkline(sparkEl, m.sparkValues, m.color);
    }
  });
}

// ---- AQI Panel ----
function renderAQIPanel() {
  const { aqi } = state;
  if (!aqi) return;
  const { current } = aqi;
  const info = getAQILabel(current.aqi);

  const panel = el('aqi-panel');
  if (!panel) return;

  const pct = Math.min(current.aqi / 500 * 100, 100);
  const trend = state.aqi?.hourlyAqi?.[1]?.aqi || current.aqi;
  const diff = trend - current.aqi;
  const diffStr = diff > 0 ? `↑ ${diff}` : diff < 0 ? `↓ ${Math.abs(diff)}` : '→ Stable';

  panel.innerHTML = `
    <div class="section-header mb-md">
      <span class="section-title">AQI (Air Quality Index)</span>
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
    </div>
    <div class="ap-value" style="color:${info.color}">${current.aqi}</div>
    <div class="ap-label" style="color:${info.color}">${info.label}</div>
    <div class="ap-vs-normal mt-sm">
      <span style="color:${diff >= 0 ? 'var(--color-fair)' : 'var(--color-excellent)'}">
        ${diffStr} vs last hour
      </span>
    </div>
    <div class="aqi-gauge-bar mt-md mb-sm">
      <div class="aqi-pointer" style="left:${pct}%"></div>
    </div>
    <div class="aqi-bar-labels">
      <span>0</span><span>100</span><span>200</span><span>300</span><span>500</span>
    </div>
    <div class="section-title mt-lg mb-sm" style="font-size:var(--text-sm)">Primary Pollutants</div>
    <div class="pollutants-list">
      <div class="pollutant-row"><span class="pr-dot" style="background:#f59e0b"></span><span class="pr-name">PM2.5</span><span class="pr-val">${current.pm25} µg/m³</span></div>
      <div class="pollutant-row"><span class="pr-dot" style="background:#f97316"></span><span class="pr-name">PM10</span><span class="pr-val">${current.pm10} µg/m³</span></div>
      <div class="pollutant-row"><span class="pr-dot" style="background:#22c55e"></span><span class="pr-name">O₃</span><span class="pr-val">${current.ozone} ppb</span></div>
      <div class="pollutant-row"><span class="pr-dot" style="background:#3b82f6"></span><span class="pr-name">NO₂</span><span class="pr-val">${current.no2} µg/m³</span></div>
      <div class="pollutant-row"><span class="pr-dot" style="background:#8b5cf6"></span><span class="pr-name">CO</span><span class="pr-val">${current.co} ppm</span></div>
    </div>
  `;
}

// ---- Scores ----
function renderScores() {
  const { weather, aqi } = state;
  const { current } = weather;
  const aqiVal = aqi?.current.aqi || 50;

  const aeroScore = calcAeroScore({
    aqi: aqiVal,
    temp: current.temp,
    humidity: current.humidity,
    uv: current.uvIndex,
    wind: current.windSpeed,
  });
  const aeroInfo = getAeroScoreLabel(aeroScore);

  const comfortScore = calcComfortScore({
    temp: current.temp,
    humidity: current.humidity,
    wind: current.windSpeed,
  });
  const comfortInfo = getComfortLabel(comfortScore);

  // Rich AeroScore card: big donut + factor breakdown + advice
  renderAeroScoreCard(aeroScore, aeroInfo, {
    aqi: aqiVal,
    temp: current.temp,
    humidity: current.humidity,
    uv: current.uvIndex,
    wind: current.windSpeed,
  });

  // Any legacy/simple aero cards (other pages) still get the basic ring
  qsa('[data-score="aero"]:not(.aero-card)').forEach(el => {
    const valEl = el.querySelector('.sc-value');
    const statusEl = el.querySelector('.sc-status');
    const ringEl = el.querySelector('.sc-ring');
    if (valEl) valEl.innerHTML = `${aeroScore}<span>/100</span>`;
    if (statusEl) { statusEl.textContent = aeroInfo.label; statusEl.style.color = aeroInfo.color; }
    if (ringEl) buildGaugeRing(ringEl, aeroScore, 100, aeroInfo.color);
  });

  qsa('[data-score="comfort"]').forEach(el => {
    const valEl = el.querySelector('.sc-value');
    const statusEl = el.querySelector('.sc-status');
    const ringEl = el.querySelector('.sc-ring');
    if (valEl) valEl.innerHTML = `${comfortScore}<span>/100</span>`;
    if (statusEl) { statusEl.textContent = comfortInfo.label; statusEl.style.color = comfortInfo.color; }
    if (ringEl) buildGaugeRing(ringEl, comfortScore, 100, comfortInfo.color);
  });
}

function clampPct(n) { return Math.max(0, Math.min(100, Math.round(n))); }

// ── Safety-level color helpers ────────────────────────────────────────────────
// Each returns a hex color: green = safe, yellow = moderate,
// orange = unhealthy/uncomfortable, red = hazardous.
function aqiColor(v)  { return v<=50?'#22c55e':v<=100?'#eab308':v<=150?'#f97316':'#ef4444'; }
function tempColor(v) { return v>=18&&v<=28?'#22c55e':v>=10&&v<=35?'#eab308':'#ef4444'; }
function humColor(v)  { return v>=35&&v<=65?'#22c55e':v>=20&&v<=80?'#eab308':'#f97316'; }
function uvColor(v)   { return v<=2?'#22c55e':v<=5?'#eab308':v<=7?'#f97316':'#ef4444'; }
function windColor(v) { return v<20?'#22c55e':v<40?'#eab308':v<60?'#f97316':'#ef4444'; }

/**
 * Build per-factor display data for the AeroScore breakdown bars.
 *
 * Each factor has:
 *  fill  – bar width as % of the bar track, scaled to a sensible "max" for
 *           that metric so 100% fill = clearly problematic/extreme.
 *          Humidity fills 1:1 with its % value (0-100 natural scale).
 *          Other metrics are mapped to a 0-100 track over their meaningful range.
 *  color – safety-level color (green → yellow → orange → red) so the user
 *          immediately sees whether the value is safe without needing to know thresholds.
 *  q     – internal 0-100 quality score kept for aeroAdvice worst-factor logic.
 *  val   – formatted display string shown on the right of the bar.
 */
function aeroFactors({ aqi, temp, humidity, uv, wind }) {
  const units     = state.settings.units;
  // Quality penalties (for aeroAdvice worst-factor selection only)
  const aqiP  = aqi <= 50 ? 0 : aqi <= 100 ? 10 : aqi <= 150 ? 20 : aqi <= 200 ? 35 : 50;
  const tDev  = Math.min(Math.abs(temp - 23) / 5, 3) * 5;
  const hDev  = humidity<20||humidity>80?15:humidity<30||humidity>70?8:humidity<40||humidity>60?3:0;
  const uvP   = uv <= 2 ? 0 : uv <= 5 ? 3 : uv <= 7 ? 8 : uv <= 10 ? 15 : 22;
  const wP    = wind < 10 ? 0 : wind < 20 ? 2 : wind < 40 ? 6 : wind < 60 ? 12 : 18;

  return [
    {
      key: 'aqi', label: 'Air Quality',
      // Scale: 0 AQI = empty bar, 200 AQI = full bar (200 = clearly unhealthy)
      fill:  clampPct(aqi / 200 * 100),
      color: aqiColor(aqi),
      q:     clampPct(100 - aqiP * 2),
      val:   `${Math.round(aqi)} AQI`,
    },
    {
      key: 'temp', label: 'Temperature',
      // Scale: −5°C = empty, 45°C = full (50-degree window covers realistic extremes)
      fill:  clampPct((temp + 5) / 50 * 100),
      color: tempColor(temp),
      q:     clampPct(100 - tDev * 6.7),
      val:   `${convertTemp(temp, units.temperature)}${tempUnit(units.temperature)}`,
    },
    {
      key: 'humidity', label: 'Humidity',
      // Humidity IS already a 0-100% value — fill 1:1 so the bar matches the label
      fill:  clampPct(humidity),
      color: humColor(humidity),
      q:     clampPct(100 - hDev * 6.7),
      val:   `${Math.round(humidity)}%`,
    },
    {
      key: 'uv', label: 'UV Index',
      // Scale: UV 0 = empty, UV 12 = full (12+ = extreme)
      fill:  clampPct(uv / 12 * 100),
      color: uvColor(uv),
      q:     clampPct(100 - uvP * 4.5),
      val:   `UV ${Math.round(uv)}`,
    },
    {
      key: 'wind', label: 'Wind',
      // Scale: 0 km/h = empty, 80 km/h = full (80+ = dangerous)
      fill:  clampPct(wind / 80 * 100),
      color: windColor(wind),
      q:     clampPct(100 - wP * 5.5),
      val:   `${convertWind(wind, units.wind)} ${windUnit(units.wind)}`,
    },
  ];
}

// Short advisory line based on the weakest factor
function aeroAdvice(score, factors) {
  const worst = [...factors].sort((a, b) => a.q - b.q)[0];
  if (score >= 76) return 'Great conditions for outdoor activity.';
  const map = {
    aqi: 'Air quality is the main concern — limit prolonged outdoor exposure.',
    temp: 'Temperature is less than ideal — dress accordingly and stay hydrated.',
    humidity: 'Humidity is the main concern — it may feel uncomfortable outdoors.',
    uv: 'UV is high — wear sunscreen and limit midday sun.',
    wind: 'Winds are strong — take care with outdoor plans.',
  };
  return map[worst.key] || 'Conditions are mixed — check the factors below.';
}

function renderAeroScoreCard(score, info, metrics) {
  const card = qs('.aero-card[data-score="aero"]');
  if (!card) return;
  const factors = aeroFactors(metrics);

  const ringEl = card.querySelector('#aero-ring');
  if (ringEl) ringEl.innerHTML = bigScoreRing(score, info.color);

  const statusEl = card.querySelector('#aero-status');
  if (statusEl) { statusEl.textContent = info.label; statusEl.style.color = info.color; }

  const adviceEl = card.querySelector('#aero-advice');
  if (adviceEl) adviceEl.textContent = aeroAdvice(score, factors);

  const factorsEl = card.querySelector('#aero-factors');
  if (factorsEl) {
    factorsEl.innerHTML = factors.map(f => `
      <div class="aero-factor">
        <span class="af-label">${f.label}</span>
        <span class="af-bar">
          <span class="af-bar-fill" style="width:${Math.max(f.fill, 2)}%;background:${f.color};transition:width 1.2s cubic-bezier(.4,0,.2,1)"></span>
        </span>
        <span class="af-val" style="color:${f.color}">${f.val}</span>
      </div>`).join('');
  }
}

// Big donut with the score number centered inside
function bigScoreRing(score, color) {
  const size = 132, r = 56, cx = 66, cy = 66, sw = 11;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, score / 100)));
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="AeroScore ${score} of 100">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(128,128,128,.16)" stroke-width="${sw}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
        stroke-dasharray="${circ}" stroke-dashoffset="${off}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)"/>
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" dominant-baseline="middle"
        style="font-size:34px;font-weight:800;fill:var(--text-primary)">${score}</text>
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" dominant-baseline="middle"
        style="font-size:12px;font-weight:600;fill:var(--text-secondary)">/ 100</text>
    </svg>`;
}

// ---- Home 7-day AQI trend chart ----
let homeAqiChart = null;
function renderHomeAqiChart() {
  const canvas = el('home-aqi-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  const curAqi = state.aqi?.current?.aqi ?? 78;

  // Update the "today" badge in the card header
  const todayBadge = el('home-aqi-today');
  if (todayBadge) {
    const info = getAQILabel(curAqi);
    todayBadge.textContent = `${Math.round(curAqi)} Today`;
    todayBadge.style.color = info.color;
    todayBadge.style.background = hexToRgba(info.color, 0.15);
  }

  // Build a 7-day series from stored history; fall back to synthesized values
  const history = Storage.getHistory();
  const byDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const rec = [...history].reverse().find(h => h.date === key && typeof h.aqi === 'number');
    byDay.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      aqi: rec ? Math.round(rec.aqi) : null,
    });
  }
  // Today is always the live value
  byDay[6].aqi = Math.round(curAqi);
  // Fill any gaps with a gentle synthesized trend around the current value
  for (let i = 0; i < 7; i++) {
    if (byDay[i].aqi == null) {
      const wobble = Math.round((Math.sin(i * 1.3) * 0.12 + (i - 3) * 0.02) * curAqi);
      byDay[i].aqi = Math.max(5, Math.round(curAqi + wobble));
    }
  }

  const colors = byDay.map(d => getAQILabel(d.aqi).color);
  if (homeAqiChart) { homeAqiChart.destroy(); homeAqiChart = null; }
  homeAqiChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: byDay.map(d => d.label),
      datasets: [{
        data: byDay.map(d => d.aqi),
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 22,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `AQI ${c.parsed.y}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(128,128,128,.7)', font: { size: 10 } } },
        y: { display: false, beginAtZero: true, suggestedMax: Math.max(120, curAqi + 30) },
      },
      animation: { duration: 600 },
    },
  });
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---- Today vs Normal ----
function renderTodayVsNormal() {
  const { weather, aqi } = state;
  const { current } = weather;
  const history = Storage.getHistory();
  const settings = state.settings;
  const units = settings.units;

  const tempNormals = calcHistoricalNormals(history, 'temp');
  const aqiNormals = calcHistoricalNormals(history, 'aqi');
  const humNormals = calcHistoricalNormals(history, 'humidity');
  const windNormals = calcHistoricalNormals(history, 'wind');

  const normalTemp = tempNormals.avg30 || 29;
  const normalAqi = aqiNormals.avg30 || 61;
  const normalHum = humNormals.avg30 || 75;
  const normalWind = windNormals.avg30 || 16;

  const tempDiff = percentDiff(current.temp, normalTemp);
  const aqiDiff = percentDiff(aqi?.current.aqi || 78, normalAqi);
  const humDiff = percentDiff(current.humidity, normalHum);
  const windDiff = percentDiff(current.windSpeed, normalWind);

  const items = [
    {
      label: 'Temperature',
      current: `${convertTemp(current.temp, units.temperature)}${tempUnit(units.temperature)}`,
      normal: `Normal: ${convertTemp(Math.round(normalTemp), units.temperature)}${tempUnit(units.temperature)}`,
      diff: tempDiff,
      color: '#f97316',
      sparkValues: history.slice(-7).map(h => h.temp).filter(Boolean),
    },
    {
      label: 'AQI',
      current: aqi?.current.aqi || 78,
      normal: `Normal: ${Math.round(normalAqi)}`,
      diff: aqiDiff,
      color: '#eab308',
      sparkValues: history.slice(-7).map(h => h.aqi).filter(Boolean),
    },
    {
      label: 'Humidity',
      current: `${current.humidity}%`,
      normal: `Normal: ${Math.round(normalHum)}%`,
      diff: humDiff,
      color: '#3b82f6',
      sparkValues: history.slice(-7).map(h => h.humidity).filter(Boolean),
    },
    {
      label: 'Wind Speed',
      current: `${convertWind(current.windSpeed, units.wind)} ${windUnit(units.wind)}`,
      normal: `Normal: ${convertWind(Math.round(normalWind), units.wind)} ${windUnit(units.wind)}`,
      diff: windDiff,
      color: '#8b5cf6',
      sparkValues: history.slice(-7).map(h => h.wind).filter(Boolean),
    },
  ];

  const container = el('today-vs-normal');
  if (!container) return;

  container.innerHTML = items.map((item, i) => `
    <div class="tn-item">
      <div class="tn-label">${item.label}</div>
      <div class="tn-current">${item.current}</div>
      <div class="tn-delta ${item.diff.dir}">
        ${item.diff.dir === 'up' ? '↑' : item.diff.dir === 'down' ? '↓' : '→'}
        ${item.diff.value}%
      </div>
      <div class="tn-normal">${item.normal}</div>
      <div class="tn-sparkline" id="tn-spark-${i}"></div>
    </div>
  `).join('');

  // Build sparklines after DOM update
  requestAnimationFrame(() => {
    items.forEach((item, i) => {
      const sparkEl = el(`tn-spark-${i}`);
      if (sparkEl && item.sparkValues.length > 1) {
        buildSparkline(sparkEl, item.sparkValues, item.color);
      }
    });
  });
}

// ---- Hourly Forecast ----
function renderHourlyForecast() {
  const { weather, settings } = state;
  const units = settings.units;
  const container = el('hourly-forecast');
  if (!container) return;

  container.innerHTML = weather.hourly.slice(0, 12).map((h, i) => {
    const info = getWeatherInfo(h.weatherCode);
    const temp = convertTemp(h.temp, units.temperature);
    const isNow = i === 0;
    return `
      <div class="hourly-item ${isNow ? 'active' : ''}">
        <div class="hi-time">${isNow ? 'Now' : formatHour(h.time)}</div>
        <div class="hi-icon">${info.icon}</div>
        <div class="hi-temp">${temp}°</div>
        <div class="hi-precip">💧 ${h.precipProb}%</div>
      </div>
    `;
  }).join('');
}

// ---- Rain Forecast ----
function renderRainForecast() {
  const { weather } = state;
  const card    = el('rain-forecast-card');
  const content = el('rain-forecast-content');
  if (!card || !content || !weather?.hourly?.length) return;

  card.style.display = '';
  const hourly = weather.hourly.slice(0, 24);
  const THRESHOLD = 40; // min % to count as rain

  // Find first rain window
  let rainStart = -1, rainEnd = -1;
  for (let i = 0; i < hourly.length; i++) {
    if (hourly[i].precipProb >= THRESHOLD) {
      if (rainStart === -1) rainStart = i;
      rainEnd = i;
    } else if (rainStart !== -1 && i - rainEnd > 2) {
      break; // gap of 2+ dry hours ends the window
    }
  }

  if (rainStart === -1) {
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;padding:4px 0 12px">
        <div style="font-size:2rem">☀️</div>
        <div>
          <div style="font-weight:700;font-size:var(--text-lg)">No rain expected</div>
          <div style="opacity:.5;font-size:var(--text-sm);margin-top:3px">Clear for the next 24 hours</div>
        </div>
      </div>
      ${buildRainBar(hourly)}`;
    return;
  }

  // Peak probability within the window
  let peakIdx = rainStart;
  for (let i = rainStart; i <= rainEnd; i++) {
    if (hourly[i].precipProb > hourly[peakIdx].precipProb) peakIdx = i;
  }
  const peakProb = hourly[peakIdx].precipProb;
  const peakCode = hourly[peakIdx].weatherCode;
  const intensity = rainIntensity(peakProb, peakCode);

  const durationHrs = rainEnd - rainStart + 1;
  const durationStr = durationHrs <= 1 ? 'about 1 hour'
                    : durationHrs < 24  ? `~${durationHrs} hours`
                    :                     'most of the day';

  const arrivalStr = rainStart === 0 ? '🌧 Raining now'
                   : rainStart === 1 ? '🕐 Starts in about 1 hour'
                   :                   `🕐 Starts in ~${rainStart} hours`;

  const endNote = rainEnd < hourly.length - 1
    ? `Ends around ${formatHour(hourly[Math.min(rainEnd + 1, hourly.length - 1)].time)}`
    : 'Continues through the day';

  content.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:1.5rem">${intensity.emoji}</span>
          <span style="font-weight:800;font-size:var(--text-xl);color:${intensity.color}">${intensity.label} Rain</span>
        </div>
        <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:3px">${arrivalStr}</div>
        <div style="font-size:var(--text-sm);opacity:.55">Duration: ${durationStr}</div>
        <div style="font-size:var(--text-sm);opacity:.55">${endNote}</div>
      </div>
      <div style="text-align:center;flex-shrink:0;background:${intensity.bg};border-radius:var(--radius-lg);padding:10px 14px">
        <div style="font-size:var(--text-2xl);font-weight:800;color:${intensity.color}">${peakProb}%</div>
        <div style="font-size:10px;opacity:.6;margin-top:1px">peak chance</div>
      </div>
    </div>
    ${buildRainBar(hourly)}`;
}

function rainIntensity(prob, weatherCode) {
  if ([65, 82, 95, 96, 99].includes(weatherCode))
    return { label: 'Heavy',    color: '#2563eb', bg: 'rgba(37,99,235,.1)',   emoji: '⛈️' };
  if ([63, 81].includes(weatherCode))
    return { label: 'Moderate', color: '#3b82f6', bg: 'rgba(59,130,246,.1)',  emoji: '🌧️' };
  if ([51, 53, 55, 61, 80].includes(weatherCode))
    return { label: 'Light',    color: '#60a5fa', bg: 'rgba(96,165,250,.1)',  emoji: '🌦️' };
  if (prob >= 80)
    return { label: 'Heavy',    color: '#2563eb', bg: 'rgba(37,99,235,.1)',   emoji: '⛈️' };
  if (prob >= 60)
    return { label: 'Moderate', color: '#3b82f6', bg: 'rgba(59,130,246,.1)',  emoji: '🌧️' };
  return   { label: 'Light',    color: '#60a5fa', bg: 'rgba(96,165,250,.1)',  emoji: '🌦️' };
}

function buildRainBar(hourly) {
  const bars = hourly.slice(0, 12).map((h, i) => {
    const prob   = h.precipProb ?? 0;
    const pct    = Math.max(2, prob); // at least 2% height so container isn't blank
    const barH   = Math.round(pct * 0.54); // max ≈ 54px at 100%
    // Dry bars: a visible muted gray; wet bars: blue gradient
    const color  = prob < 40 ? 'rgba(96,165,250,.28)'    // blue-400/28 — light blue for dry/low-rain bars
                 : prob < 60 ? '#93c5fd'                  // blue-300
                 : prob < 80 ? '#60a5fa'                  // blue-400
                 :              '#3b82f6';                 // blue-500
    const labelVisible = prob >= 5;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:0">
        <div style="font-size:9px;font-weight:600;opacity:.65;text-align:center;min-height:13px;color:${prob>=40?color:'inherit'}">${labelVisible ? prob + '%' : ''}</div>
        <div style="position:relative;display:flex;align-items:flex-end;height:54px;width:100%;background:rgba(59,130,246,.09);border-radius:4px;overflow:hidden">
          <div style="width:100%;border-radius:3px 3px 0 0;background:${color};height:${barH}px;transition:height .4s ease"></div>
        </div>
        <div style="font-size:9px;opacity:.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center">${i === 0 ? 'Now' : formatHour(h.time)}</div>
      </div>`;
  }).join('');

  return `<div style="margin-top:4px">
    <div style="font-size:10px;opacity:.4;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Precip Probability – Next 12h</div>
    <div style="display:flex;gap:3px">${bars}</div>
  </div>`;
}

// ---- Daily Forecast ----
function renderDailyForecast() {
  const { weather, settings } = state;
  const units = settings.units;
  const container = el('daily-forecast');
  if (!container) return;

  container.innerHTML = weather.daily.slice(0, 7).map(d => {
    const info = getWeatherInfo(d.weatherCode);
    const hi = convertTemp(d.tempMax, units.temperature);
    const lo = convertTemp(d.tempMin, units.temperature);
    const tU = tempUnit(units.temperature);
    return `
      <div class="daily-item">
        <div class="di-day">${formatDay(d.date)}</div>
        <div class="di-icon">${info.icon}</div>
        <div class="di-precip">💧 ${d.precipProb}%</div>
        <div class="di-temps">
          <span class="hi">${hi}°</span>
          <span class="lo">${lo}°</span>
        </div>
      </div>
    `;
  }).join('');
}

// ---- Sunrise / Sunset ----
function renderSunriseSunset() {
  const { weather } = state;
  const today = weather.daily[0];
  if (!today) return;

  const srTime = formatSunTime(today.sunrise);
  const ssTime = formatSunTime(today.sunset);

  qsa('.sunrise-time').forEach(el => el.textContent = srTime);
  qsa('.sunset-time').forEach(el => el.textContent = ssTime);

  // SVG arc
  const svgEl = el('sun-arc');
  if (!svgEl) return;
  const now = new Date();
  const sr = new Date(today.sunrise);
  const ss = new Date(today.sunset);
  const total = ss - sr;
  const elapsed = Math.max(0, Math.min(now - sr, total));
  const pct = total > 0 ? elapsed / total : 0.5;

  const W = 200, H = 80, r = 70;
  const cx = W / 2, startY = H + 10;
  const startX = cx - r, endX = cx + r;
  const sunAngle = Math.PI - (pct * Math.PI);
  const sunX = cx + r * Math.cos(sunAngle);
  const sunY = startY - r * Math.sin(sunAngle) + 10;

  svgEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${startX},${startY + 10} A${r},${r} 0 0 1 ${endX},${startY + 10}"
        fill="none" stroke="rgba(255,180,0,.2)" stroke-width="2.5" stroke-dasharray="4 4"/>
      <path d="M${startX},${startY + 10} A${r},${r} 0 0 1 ${sunX},${sunY}"
        fill="none" stroke="rgba(255,180,0,.7)" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${sunX}" cy="${sunY}" r="6" fill="#fbbf24"/>
      <circle cx="${sunX}" cy="${sunY}" r="10" fill="rgba(251,191,36,.25)"/>
    </svg>
  `;
}

// ---- Health Advisory ----
function renderHealthAdvisory() {
  const { aqi } = state;
  const aqiVal = aqi?.current.aqi || 78;
  const advisory = getHealthAdvisory(aqiVal);

  qsa('.health-advisory').forEach(el => {
    el.style.background = advisory.bgColor;
    const badge = el.querySelector('.ha-badge');
    const text = el.querySelector('.ha-text');
    if (badge) { badge.textContent = advisory.level; badge.style.color = advisory.color; }
    if (text) text.textContent = advisory.text;
  });
}

// ---- Outdoor Recs ----
function renderOutdoorRecs() {
  const { weather, aqi } = state;
  const { current } = weather;
  const recs = getOutdoorRecs({
    aqi: aqi?.current.aqi || 50,
    uv: current.uvIndex,
    wind: current.windSpeed,
    temp: current.temp,
  });

  const grid = el('outdoor-recs');
  if (!grid) return;
  grid.innerHTML = recs.map(r => `
    <div class="rec-item">
      <div class="ri-icon">${r.icon}</div>
      <div class="ri-name">${r.name}</div>
      <div class="ri-status ${r.status.toLowerCase()}" style="color:${r.color}">${r.status}</div>
    </div>
  `).join('');
}

// ---- Saved Places ----
function renderSavedPlaces() {
  const places = Storage.getSavedPlaces();
  const list = el('saved-places-list');
  if (!list) return;
  list.innerHTML = places.slice(0, 3).map((p, i) => `
    <div class="saved-place-item" onclick="loadPlace(${p.lat},${p.lon},'${p.name.replace(/'/g,"\\'")}',${i})">
      <div class="spi-icon">📍</div>
      <div class="spi-body">
        <div class="spi-name">${p.name}</div>
        <div class="spi-state">${p.state || '–'}</div>
      </div>
      <div class="spi-right">
        <span class="spi-temp">${p.temp}°</span>
        <span class="spi-cond">${p.condition}</span>
      </div>
    </div>
  `).join('');
}

// ---- Alerts count badge ----
// Active alerts = rain + wind (always) + high UV + poor AQI. The badge clears
// once the user opens the Alerts page (a "seen" signature is stored there).
function activeAlertCount() {
  const aqiVal = state.aqi?.current?.aqi ?? 78;
  const uv = state.weather?.current?.uvIndex ?? 8;
  let count = 2; // rain + wind
  if (uv >= 7) count++;
  if (aqiVal > 100) count++;
  return count;
}
function updateAlertsCount() {
  const count = activeAlertCount();
  // Use the same key as nav.js and alerts.js so marking-seen in any page
  // is respected when the user returns to Home.
  let seenCount = -1;
  try { seenCount = parseInt(localStorage.getItem('aerosense_alerts_seen') || '-1', 10); } catch (e) {}
  const unseen = (seenCount >= 0 && seenCount >= count) ? 0 : count;
  qsa('.alerts-badge').forEach(el => {
    el.textContent = unseen;
    el.style.display = unseen ? '' : 'none';
  });
}

// ---- Fullscreen Weather ----
function renderFullscreenWeather() {
  const { weather, aqi, locationName, settings } = state;
  if (!weather) return;
  const { current } = weather;
  const info = getWeatherInfo(current.weatherCode, current.isDay);
  const units = settings.units;

  const fsEl = el('fullscreen-weather');
  if (!fsEl) return;

  const fg = fsEl.querySelector('.fs-bg');
  if (fg) {
    fg.className = `fs-bg ${info.bg}`;
    if (!current.isDay) fg.classList.add('night');
  }

  const tempVal = convertTemp(current.temp, units.temperature);
  const feelsVal = convertTemp(current.feelsLike, units.temperature);
  const tUnit = tempUnit(units.temperature);

  const fsTempEl = fsEl.querySelector('.fs-temp'); if (fsTempEl) fsTempEl.textContent = `${tempVal}${tUnit}`;
  const fsLocEl = fsEl.querySelector('.fs-location span'); if (fsLocEl) fsLocEl.textContent = locationName;
  const fsCondEl = fsEl.querySelector('.fs-condition'); if (fsCondEl) fsCondEl.textContent = `${info.desc} ${info.icon}`;
  const fsFeelsEl = fsEl.querySelector('.fs-feels'); if (fsFeelsEl) fsFeelsEl.textContent = `Feels like ${feelsVal}${tUnit}`;

  if (settings.dynamicAnimations) {
    injectWeatherAnimation(fsEl.querySelector('.weather-anim-container'), info.bg);
  }
}

function toggleFullscreen() {
  const fsEl = el('fullscreen-weather');
  if (!fsEl) return;
  state.isFullscreen = !state.isFullscreen;
  fsEl.classList.toggle('show', state.isFullscreen);
  if (state.isFullscreen) {
    renderFullscreenWeather();
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    clearWeatherAnimations(fsEl.querySelector('.weather-anim-container'));
  }
}

// ---- Weather Animations ----
function animateWeatherBackground() {
  const { weather, settings } = state;
  if (!settings.dynamicAnimations) return;
  const { current } = weather;
  const info = getWeatherInfo(current.weatherCode, current.isDay);
  const container = el('hero-anim-container');
  if (container) injectWeatherAnimation(container, info.bg);
}

function injectWeatherAnimation(container, type) {
  if (!container) return;
  clearWeatherAnimations(container);

  if (type === 'rainy' || type === 'thunderstorm') {
    for (let i = 0; i < 40; i++) {
      const drop = document.createElement('div');
      drop.className = 'rain-drop';
      drop.style.cssText = `
        left: ${Math.random() * 100}%;
        height: ${Math.random() * 20 + 10}px;
        animation-duration: ${Math.random() * 0.5 + 0.5}s;
        animation-delay: ${Math.random() * 2}s;
        opacity: ${Math.random() * 0.5 + 0.3};
      `;
      container.appendChild(drop);
    }
    if (type === 'thunderstorm') {
      const bolt = document.createElement('div');
      bolt.className = 'lightning-bolt';
      container.appendChild(bolt);
      const bolt2 = document.createElement('div');
      bolt2.className = 'lightning-bolt';
      container.appendChild(bolt2);
    }
  } else if (type === 'sunny' || type === 'night-clear') {
    if (type === 'sunny') {
      const glow = document.createElement('div');
      glow.className = 'sun-glow';
      container.appendChild(glow);
      for (let i = 0; i < 12; i++) {
        const ray = document.createElement('div');
        ray.className = 'sun-ray';
        ray.style.cssText = `transform: translateX(-50%) rotate(${i * 30}deg); animation-delay: ${i * 0.1}s;`;
        container.appendChild(ray);
      }
    } else {
      // Stars
      for (let i = 0; i < 30; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 3 + 1;
        star.style.cssText = `
          left: ${Math.random() * 100}%;
          top: ${Math.random() * 70}%;
          width: ${size}px; height: ${size}px;
          animation-duration: ${Math.random() * 2 + 1.5}s;
          animation-delay: ${Math.random() * 3}s;
        `;
        container.appendChild(star);
      }
    }
  } else if (type === 'cloudy') {
    for (let i = 0; i < 3; i++) {
      const cloud = document.createElement('div');
      cloud.className = 'cloud';
      cloud.style.cssText = `
        top: ${Math.random() * 60}%;
        width: ${Math.random() * 200 + 100}px;
        height: ${Math.random() * 80 + 40}px;
        animation-duration: ${Math.random() * 20 + 20}s;
        animation-delay: ${-Math.random() * 20}s;
        opacity: ${Math.random() * 0.3 + 0.1};
      `;
      container.appendChild(cloud);
    }
  } else if (type === 'fog') {
    for (let i = 0; i < 4; i++) {
      const fog = document.createElement('div');
      fog.className = 'fog-layer';
      fog.style.cssText = `
        top: ${20 + i * 20}%;
        height: ${Math.random() * 60 + 40}px;
        animation-duration: ${Math.random() * 10 + 15}s;
        animation-delay: ${-Math.random() * 10}s;
      `;
      container.appendChild(fog);
    }
  } else if (type === 'snow') {
    for (let i = 0; i < 25; i++) {
      const flake = document.createElement('div');
      flake.className = 'snow-flake';
      flake.textContent = '❄';
      flake.style.cssText = `
        left: ${Math.random() * 100}%;
        animation-duration: ${Math.random() * 2 + 2}s;
        animation-delay: ${Math.random() * 3}s;
        font-size: ${Math.random() * 0.6 + 0.6}rem;
        opacity: ${Math.random() * 0.5 + 0.4};
      `;
      container.appendChild(flake);
    }
  }
}

function clearWeatherAnimations(container) {
  if (container) container.innerHTML = '';
}

// ---- Install Prompt ----
let deferredInstallPrompt = null;
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!Storage.isInstallDismissed()) {
      const prompt = el('install-prompt');
      if (prompt) prompt.classList.remove('hidden');
    }
  });
}
function renderInstallPrompt() {
  if (Storage.isInstallDismissed()) {
    const prompt = el('install-prompt');
    if (prompt) prompt.classList.add('hidden');
  }
}

// ---- Auto Refresh ----
function scheduleRefresh() {
  const interval = (state.settings.updateFrequency || 10) * 60 * 1000;
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    if (!document.hidden) loadData();
  }, interval);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const elapsed = Date.now() - (state.lastRefresh || 0);
      if (elapsed > interval) loadData();
    }
  });
}

function updateLastRefreshDisplay() {
  setInterval(() => {
    const el2 = el('last-updated');
    if (el2 && state.lastRefresh) {
      el2.textContent = timeAgo(state.lastRefresh);
    }
  }, 30000);
}

// ---- Offline Detection ----
function setupOfflineDetection() {
  window.addEventListener('online', () => {
    state.isOnline = true;
    hideOfflineBanner();
    loadData();
  });
  window.addEventListener('offline', () => {
    state.isOnline = false;
    showOfflineBanner();
  });
  if (!navigator.onLine) showOfflineBanner();
}
function showOfflineBanner() {
  const banner = el('offline-banner');
  if (banner) banner.classList.add('show');
}
function hideOfflineBanner() {
  const banner = el('offline-banner');
  if (banner) banner.classList.remove('show');
}

// ---- Loading ----
function showLoading(text = '') {
  const overlay = el('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
  setLoadingText(text);
}
function hideLoading() {
  const overlay = el('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}
function setLoadingText(text) {
  const textEl = el('loading-text');
  if (textEl) textEl.textContent = text;
}

// ---- Error ----
function showError(msg) {
  hideLoading();
  const errEl = el('error-message');
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

// ---- City Search ----
function showCitySearch() {
  const modal = el('city-search-modal');
  if (modal) modal.classList.add('show');
  hideLoading();
}
function hideCitySearch() {
  const modal = el('city-search-modal');
  if (modal) modal.classList.remove('show');
}

async function handleCitySearch(query) {
  if (query.length < 2) return;
  const results = await geocode(query);
  const listEl = el('city-results');
  if (!listEl) return;
  if (!results.length) {
    listEl.innerHTML = '<div style="padding:16px;opacity:.6;text-align:center">No results found</div>';
    return;
  }
  listEl.innerHTML = results.map(r => `
    <div class="city-result-item" onclick="selectCity(${r.latitude},${r.longitude},'${r.name}, ${r.country_code}')">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      <div>
        <div class="cr-name">${r.name}</div>
        <div class="cr-country">${r.admin1 || ''}, ${r.country}</div>
      </div>
    </div>
  `).join('');
}

// ---- "Browse by Country" search mode (additive — doesn't touch the
// free-text #cs-mode-search flow above) ----
let csSelectedCountry = null; // { code, name }

function renderCountryList(query) {
  const listEl = el('country-results');
  if (!listEl) return;
  const q = (query || '').trim().toLowerCase();
  let list;
  if (!q) {
    // No query yet: pin the detected country (if any) at the top so the
    // user can jump straight into it, then show the rest alphabetically.
    const detected = Storage.getUserCountry();
    const detectedEntry = detected ? findCountry(detected.code) : null;
    list = detectedEntry
      ? [detectedEntry, ...COUNTRIES.filter(c => c.code !== detectedEntry.code)]
      : COUNTRIES;
  } else {
    list = COUNTRIES.filter(c => c.name.toLowerCase().includes(q));
  }
  if (!list.length) {
    listEl.innerHTML = '<div style="padding:16px;opacity:.6;text-align:center">No countries found</div>';
    return;
  }
  const detected = Storage.getUserCountry();
  listEl.innerHTML = list.slice(0, 60).map(c => `
    <div class="city-result-item" onclick="selectCountry('${c.code}', '${c.name.replace(/'/g, "\\'")}')">
      <span class="cr-flag-badge">${c.code}</span>
      <div>
        <div class="cr-name">${c.name}${detected && detected.code === c.code ? ' <span style="opacity:.55;font-weight:500;font-size:12px">(detected)</span>' : ''}</div>
      </div>
    </div>
  `).join('');
}

window.selectCountry = (code, name) => {
  csSelectedCountry = { code, name };
  const stepCountry = el('cs-country-step');
  const stepCity = el('cs-city-step');
  const label = el('cs-selected-country-label');
  if (stepCountry) stepCountry.style.display = 'none';
  if (stepCity) stepCity.style.display = '';
  if (label) label.textContent = `${name} (${code})`;
  const cityInput = el('country-city-input');
  const cityResults = el('country-city-results');
  if (cityResults) cityResults.innerHTML = '<div style="padding:16px;text-align:center;opacity:.5;font-size:14px">Type a state or city name…</div>';
  if (cityInput) { cityInput.value = ''; cityInput.focus(); }
};

function backToCountryStep() {
  csSelectedCountry = null;
  const stepCountry = el('cs-country-step');
  const stepCity = el('cs-city-step');
  if (stepCity) stepCity.style.display = 'none';
  if (stepCountry) stepCountry.style.display = '';
  const cityInput = el('country-city-input');
  if (cityInput) cityInput.value = '';
}

async function handleCountryCitySearch(query) {
  if (!csSelectedCountry || query.length < 2) return;
  const results = await geocode(query);
  const listEl = el('country-city-results');
  if (!listEl) return;
  const filtered = results.filter(r => (r.country_code || '').toUpperCase() === csSelectedCountry.code);
  if (!filtered.length) {
    listEl.innerHTML = `<div style="padding:16px;opacity:.6;text-align:center">No places found in ${csSelectedCountry.name}</div>`;
    return;
  }
  // Reuses the existing window.selectCity handler — same markup pattern as
  // the free-text search results, so nothing about city selection changes.
  listEl.innerHTML = filtered.map(r => `
    <div class="city-result-item" onclick="selectCity(${r.latitude},${r.longitude},'${r.name}, ${r.country_code}')">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      <div>
        <div class="cr-name">${r.name}</div>
        <div class="cr-country">${r.admin1 || ''}, ${r.country}</div>
      </div>
    </div>
  `).join('');
}

function setCitySearchMode(mode) {
  qsa('.cs-tab').forEach(tab => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const modeSearch = el('cs-mode-search');
  const modeCountry = el('cs-mode-country');
  if (modeSearch) modeSearch.style.display = mode === 'search' ? '' : 'none';
  if (modeCountry) modeCountry.style.display = mode === 'country' ? '' : 'none';
  if (mode === 'country') {
    // Reset to the country-picker step each time the tab is opened, and
    // pre-render the list (pinning the detected country) right away.
    backToCountryStep();
    const input = el('country-search-input');
    if (input) input.value = '';
    renderCountryList('');
  }
}

window.selectCity = async (lat, lon, name) => {
  hideCitySearch();
  const loc = { lat, lon, name };
  state.location = loc;
  state.locationName = name;
  Storage.cacheLocation(loc);
  showLoading('Fetching weather...');
  await loadData(true);  // forceRefresh=true: skip cache, fetch for the new city
  hideLoading();
};

window.loadPlace = async (lat, lon, name, index) => {
  // Swap: save current location into the clicked slot so user can switch back
  if (typeof index === 'number' && state.location) {
    const places = Storage.getSavedPlaces();
    if (index < places.length) {
      const cur = state.location;
      const curTemp = state.weather ? Math.round(state.weather.current.temp) : (places[index].temp || 0);
      const curCond = state.weather
        ? (getWeatherInfo(state.weather.current.weatherCode, state.weather.current.isDay)?.label || 'Unknown')
        : (places[index].condition || 'Unknown');
      places[index] = {
        name:      cur.name || state.locationName || 'Current Location',
        state:     '',
        temp:      curTemp,
        condition: curCond,
        lat:       cur.lat,
        lon:       cur.lon,
      };
      Storage.savePlaces(places);
    }
  }
  await window.selectCity(lat, lon, name);
};

// ---- Event Listeners ----
function setupEventListeners() {
  // Fullscreen toggle
  qsa('.fullscreen-toggle-btn').forEach(btn => {
    btn.addEventListener('click', toggleFullscreen);
  });

  // Close fullscreen
  const fsClose = el('fs-close');
  if (fsClose) fsClose.addEventListener('click', () => {
    state.isFullscreen = true;
    toggleFullscreen();
  });

  // City search modal
  const citySearchInput = el('city-search-input');
  if (citySearchInput) {
    citySearchInput.addEventListener('input', debounce(e => handleCitySearch(e.target.value), 300));
  }
  const cityBackdrop = el('city-search-backdrop');
  if (cityBackdrop) cityBackdrop.addEventListener('click', hideCitySearch);

  // Search-mode tabs (Search vs. By Country) — additive UI on top of the
  // existing modal; switching tabs never touches the free-text search state.
  qsa('.cs-tab').forEach(tab => {
    tab.addEventListener('click', () => setCitySearchMode(tab.dataset.mode));
  });

  // "By Country" — country picker
  const countrySearchInput = el('country-search-input');
  if (countrySearchInput) {
    countrySearchInput.addEventListener('input', debounce(e => renderCountryList(e.target.value), 200));
  }

  // "By Country" — back to country list
  const countryBackBtn = el('cs-country-back');
  if (countryBackBtn) countryBackBtn.addEventListener('click', backToCountryStep);

  // "By Country" — state/city search scoped to the chosen country
  const countryCityInput = el('country-city-input');
  if (countryCityInput) {
    countryCityInput.addEventListener('input', debounce(e => handleCountryCitySearch(e.target.value), 300));
  }

  // Open city search from topbar
  const searchInput = el('topbar-search');
  if (searchInput) {
    searchInput.addEventListener('focus', () => {
      showCitySearch();
      const cityInput = el('city-search-input');
      if (cityInput) { cityInput.value = ''; cityInput.focus(); }
    });
  }

  // Install prompt
  const installBtn = el('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (outcome === 'accepted') {
          const prompt = el('install-prompt');
          if (prompt) prompt.classList.add('hidden');
        }
      }
    });
  }
  const dismissInstall = el('install-dismiss');
  if (dismissInstall) {
    dismissInstall.addEventListener('click', () => {
      Storage.dismissInstall();
      const prompt = el('install-prompt');
      if (prompt) prompt.classList.add('hidden');
    });
  }

  // Change location (open city search) from the home hero
  const heroLocChange = el('hero-location-change');
  if (heroLocChange) {
    heroLocChange.addEventListener('click', () => {
      showCitySearch();
      const cityInput = el('city-search-input');
      if (cityInput) { cityInput.value = ''; cityInput.focus(); }
    });
  }

  // Location refresh button
  const refreshBtn = el('location-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      Storage.cacheLocation(null);
      Storage.remove('location');
      showLoading('Refreshing location...');
      await loadData(true);
      hideLoading();
    });
  }

  // Keyboard shortcut: Ctrl+K → search
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      showCitySearch();
      const cityInput = el('city-search-input');
      if (cityInput) cityInput.focus();
    }
    if (e.key === 'Escape') hideCitySearch();
  });

  // Theme toggle in topbar
  qsa('.topbar-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      const settings = Storage.getSettings();
      settings.theme = next;
      Storage.saveSettings(settings);
      state.settings = settings;
    });
  });
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);

// Expose for inline handlers
window.AeroSense = { loadData, applyTheme, toggleFullscreen };
