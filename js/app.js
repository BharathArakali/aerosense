/* ============================================================
   AeroSense – app.js
   Main application controller – Home page
   ============================================================ */

import Storage from './storage.js';
import { fetchWeather, estimateRainArrival, windDirLabel } from './weather.js';
import { fetchAQI, getHealthAdvisory } from './aqi.js';
import {
  getWeatherInfo, getAQILabel, getUVLabel,
  calcAeroScore, getAeroScoreLabel,
  calcComfortScore, getComfortLabel,
  getOutdoorRecs,
  convertTemp, tempUnit, convertWind, windUnit,
  convertPressure, pressureUnit, convertDistance, distanceUnit,
  formatHour, formatDay, formatSunTime, timeAgo,
  reverseGeocode, geocode,
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
  showLoading('Initializing AeroSense...');
  setupEventListeners();
  setupOfflineDetection();
  setupInstallPrompt();
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
  setLoadingText('Getting your location...');

  // Try cached location first
  let loc = Storage.getCachedLocation();

  if (!loc || forceRefresh) {
    try {
      loc = await getUserLocation();
      Storage.cacheLocation(loc);
    } catch {
      // Location denied – show city search
      showCitySearch();
      // Try loading from cache
      const cw = Storage.getCachedWeather();
      const ca = Storage.getCachedAQI();
      if (cw) { state.weather = cw.data; state.aqi = ca?.data; renderAll(); }
      return;
    }
  }

  state.location = loc;
  state.locationName = loc.name || await reverseGeocode(loc.lat, loc.lon);
  if (!loc.name) {
    loc.name = state.locationName;
    Storage.cacheLocation(loc);
  }

  setLoadingText('Fetching weather data...');

  // Try fetching fresh data; fall back to cache if offline
  try {
    const [weather, aqiData] = await Promise.all([
      fetchWeather(loc.lat, loc.lon),
      fetchAQI(loc.lat, loc.lon),
    ]);
    state.weather = weather;
    state.aqi = aqiData;
    Storage.cacheWeather(weather);
    Storage.cacheAQI(aqiData);
    state.lastRefresh = Date.now();

    // Append to history
    Storage.appendHistory({
      temp: weather.current.temp,
      aqi: aqiData.current.aqi,
      humidity: weather.current.humidity,
      wind: weather.current.windSpeed,
    });
    hideOfflineBanner();
  } catch (err) {
    console.warn('[AeroSense] Fetch failed, using cache:', err);
    const cw = Storage.getCachedWeather();
    const ca = Storage.getCachedAQI();
    if (cw) {
      state.weather = cw.data;
      state.aqi = ca?.data;
      showOfflineBanner();
    } else {
      showError('Unable to load weather data. Please check your connection.');
      return;
    }
  }

  renderAll();
}

// ---- Geolocation ----
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// ---- Render All ----
function renderAll() {
  if (!state.weather) return;
  renderHero();
  renderMetricsGrid();
  renderAQIPanel();
  renderScores();
  renderTodayVsNormal();
  renderHourlyForecast();
  renderDailyForecast();
  renderSunriseSunset();
  renderHealthAdvisory();
  renderOutdoorRecs();
  renderSavedPlaces();
  renderInstallPrompt();
  updateAlertsCount();
  animateWeatherBackground();
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
  qsa('.hero-location-name').forEach(el => el.textContent = locationName);
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
      label: 'Pressure', labelIcon: '🌡',
      value: `${convertPressure(current.pressure, units.pressure)}`,
      sub: pressureUnit(units.pressure),
      color: '#6366f1',
      sparkValues: null,
    },
    {
      id: 'metric-visibility',
      label: 'Visibility', labelIcon: '👁',
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
      <div class="mc-label">${m.labelIcon} ${m.label}</div>
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

  // Update all aero score elements
  qsa('[data-score="aero"]').forEach(el => {
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
  list.innerHTML = places.slice(0, 3).map(p => `
    <div class="saved-place-item" onclick="loadPlace(${p.lat},${p.lon},'${p.name}')">
      <div class="spi-icon">📍</div>
      <div class="spi-body">
        <div class="spi-name">${p.name}</div>
        <div class="spi-state">${p.state}</div>
      </div>
      <div class="spi-temp">${p.temp}°</div>
      <div class="spi-cond">${p.condition}</div>
    </div>
  `).join('');
}

// ---- Alerts count badge ----
function updateAlertsCount() {
  const count = 3; // derived from real alerts in production
  qsa('.alerts-badge').forEach(el => {
    el.textContent = count;
    el.style.display = count ? '' : 'none';
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
  const fsCondEl = fsEl.querySelector('.fs-condition'); if (fsCondEl) fsCondEl.innerHTML = `${info.desc} ${info.icon}`;
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

window.selectCity = async (lat, lon, name) => {
  hideCitySearch();
  const loc = { lat, lon, name };
  state.location = loc;
  state.locationName = name;
  Storage.cacheLocation(loc);
  showLoading('Fetching weather...');
  await loadData();
  hideLoading();
};

window.loadPlace = async (lat, lon, name) => {
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
