/* ============================================================
   AeroSense – insights.js
   Insights page: Chart.js trends, scores, Today vs Normal
   ============================================================ */

import Storage from './storage.js';
import { fetchWeather } from './weather.js';
import { fetchAQI, getHealthAdvisory } from './aqi.js';
import {
  calcAeroScore, getAeroScoreLabel,
  calcComfortScore, getComfortLabel,
  getAQILabel, getUVLabel,
  getOutdoorRecs,
  convertTemp, tempUnit,
  convertWind, windUnit,
  formatHour,
  calcHistoricalNormals, percentDiff,
  buildGaugeRing, buildSparkline,
  el, qs, qsa,
} from './utils.js';

let charts = {};
let state = { weather: null, aqi: null, settings: null };

async function init() {
  state.settings = Storage.getSettings();
  applyTheme(state.settings.theme);

  const cw = Storage.getCachedWeather();
  const ca = Storage.getCachedAQI();
  state.weather = cw?.data;
  state.aqi = ca?.data;

  if (!state.weather) {
    const loc = Storage.getCachedLocation() || { lat: 12.9716, lon: 77.5946 };
    try {
      const [w, a] = await Promise.all([
        fetchWeather(loc.lat, loc.lon),
        fetchAQI(loc.lat, loc.lon),
      ]);
      state.weather = w;
      state.aqi = a;
      Storage.cacheWeather(w);
      Storage.cacheAQI(a);
    } catch (e) {
      console.warn('[Insights] fetch failed', e);
    }
  }

  renderAll();
}

function applyTheme(theme) {
  const isDark = theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function renderAll() {
  if (!state.weather) return;
  renderScoreCards();
  renderTodayVsNormal();
  renderCharts();
  renderHealthAdvisory();
  renderOutdoorRecs();
}

// ---- Score Cards ----
function renderScoreCards() {
  const { weather, aqi } = state;
  const { current } = weather;
  const aqiVal = aqi?.current.aqi || 50;

  const aeroScore = calcAeroScore({ aqi: aqiVal, temp: current.temp, humidity: current.humidity, uv: current.uvIndex, wind: current.windSpeed });
  const aeroInfo = getAeroScoreLabel(aeroScore);

  const comfortScore = calcComfortScore({ temp: current.temp, humidity: current.humidity, wind: current.windSpeed });
  const comfortInfo = getComfortLabel(comfortScore);

  const aqiInfo = getAQILabel(aqiVal);
  const uvInfo = getUVLabel(current.uvIndex);

  const cards = [
    {
      id: 'score-aeroscore',
      label: 'AeroScore™',
      value: aeroScore,
      max: 100,
      status: aeroInfo.label,
      color: aeroInfo.color,
      extra: `Great day to be outside!`,
    },
    {
      id: 'score-comfort',
      label: 'Comfort Score',
      value: comfortScore,
      max: 100,
      status: comfortInfo.label,
      color: comfortInfo.color,
    },
    {
      id: 'score-aqi',
      label: 'AQI',
      value: aqiVal,
      max: 500,
      status: aqiInfo.label,
      color: aqiInfo.color,
    },
    {
      id: 'score-uv',
      label: 'UV Index',
      value: current.uvIndex,
      max: 11,
      status: uvInfo.label,
      color: uvInfo.color,
    },
    {
      id: 'score-humidity',
      label: 'Humidity',
      value: current.humidity,
      max: 100,
      status: current.humidity < 40 ? 'Dry' : current.humidity > 70 ? 'Humid' : 'Comfortable',
      color: '#3b82f6',
    },
  ];

  // Build sparklines from hourly data
  const hourlyAqi = aqi?.hourlyAqi?.slice(0, 12).map(h => h.aqi) || [];
  const hourlyTemp = weather.hourly.slice(0, 12).map(h => h.temp);
  const hourlyHum = weather.hourly.slice(0, 12).map(h => h.humidity);
  const hourlyUV = weather.hourly.slice(0, 12).map(h => h.uvIndex);
  const sparkMap = {
    'score-aeroscore': { data: hourlyTemp, color: aeroInfo.color },
    'score-comfort': { data: hourlyHum, color: comfortInfo.color },
    'score-aqi': { data: hourlyAqi, color: aqiInfo.color },
    'score-uv': { data: hourlyUV, color: uvInfo.color },
    'score-humidity': { data: hourlyHum, color: '#3b82f6' },
  };

  const container = el('score-cards-row');
  if (!container) return;

  container.innerHTML = cards.map(c => {
    const cls = c.id === 'score-aeroscore' ? 'aeroscore' : c.id === 'score-comfort' ? 'comfort' : 'aqi';
    return `
    <div class="score-card ${cls} card-lift">
      <div class="sc-header">
        <div class="sc-text">
          <div class="sc-label">${c.label}</div>
          <div class="sc-value" style="color:${c.color}">${c.value}<span>/${c.max}</span></div>
          <div class="sc-status" style="color:${c.color}">${c.status}</div>
          ${c.extra ? `<div class="sc-extra">${c.extra}</div>` : ''}
        </div>
        <div id="${c.id}-ring" class="sc-ring"></div>
      </div>
      <div id="${c.id}-spark" class="sc-sparkline-strip"></div>
    </div>`;
  }).join('');

  // Build rings and sparklines — double rAF ensures layout is fully resolved
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cards.forEach(c => {
      const ringEl = el(`${c.id}-ring`);
      if (ringEl) buildGaugeRing(ringEl, c.value, c.max, c.color);

      const sparkEl = el(`${c.id}-spark`);
      const sparkCfg = sparkMap[c.id];
      if (sparkEl && sparkCfg?.data.length > 1) {
        // Use the parent card's width so the strip fills end-to-end
        const cardWidth = sparkEl.closest('.score-card')?.offsetWidth || 240;
        buildSparklineWide(sparkEl, sparkCfg.data, sparkCfg.color, cardWidth, 40);
      }
    });
  }));
}

/** Full-width sparkline variant for score card bottom strips */
function buildSparklineWide(container, values, color, w, h) {
  if (!values || values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  });
  const d = `M${pts.join('L')}`;
  const areaD = `M0,${h} L${pts.join('L')} L${w},${h}Z`;
  const gId = `sg${Math.random().toString(36).slice(2)}`;
  container.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block">
      <defs>
        <linearGradient id="${gId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#${gId})"/>
      <path d="${d}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`;
}

// ---- Today vs Normal ----
function renderTodayVsNormal() {
  const { weather, aqi } = state;
  const { current } = weather;
  const history = Storage.getHistory();
  const units = state.settings.units;

  const tempNormals = calcHistoricalNormals(history, 'temp');
  const aqiNormals = calcHistoricalNormals(history, 'aqi');
  const humNormals = calcHistoricalNormals(history, 'humidity');
  const windNormals = calcHistoricalNormals(history, 'wind');

  const nTemp = tempNormals.avg30 || 29;
  const nAqi = aqiNormals.avg30 || 61;
  const nHum = humNormals.avg30 || 75;
  const nWind = windNormals.avg30 || 16;

  const tDiff = percentDiff(current.temp, nTemp);
  const aDiff = percentDiff(aqi?.current.aqi || 78, nAqi);
  const hDiff = percentDiff(current.humidity, nHum);
  const wDiff = percentDiff(current.windSpeed, nWind);

  const items = [
    { label: 'Temperature', current: `${convertTemp(current.temp, units.temperature)}${tempUnit(units.temperature)}`, normal: `Normal: ${convertTemp(Math.round(nTemp), units.temperature)}${tempUnit(units.temperature)}`, diff: tDiff, color: '#f97316' },
    { label: 'AQI', current: aqi?.current.aqi || 78, normal: `Normal: ${Math.round(nAqi)}`, diff: aDiff, color: '#eab308' },
    { label: 'Humidity', current: `${current.humidity}%`, normal: `Normal: ${Math.round(nHum)}%`, diff: hDiff, color: '#3b82f6' },
    { label: 'Wind Speed', current: `${convertWind(current.windSpeed, units.wind)} ${windUnit(units.wind)}`, normal: `Normal: ${convertWind(Math.round(nWind), units.wind)} ${windUnit(units.wind)}`, diff: wDiff, color: '#8b5cf6' },
  ];

  const container = el('today-vs-normal-insights');
  if (!container) return;

  container.innerHTML = items.map(item => `
    <div class="tn-item">
      <div class="tn-label">${item.label}</div>
      <div class="tn-current" style="color:${item.color}">${item.current}</div>
      <div class="tn-delta ${item.diff.dir}" style="color:${item.diff.dir==='up'?'#f97316':item.diff.dir==='down'?'#22c55e':'#94a3b8'}">
        ${item.diff.dir === 'up' ? '↑' : item.diff.dir === 'down' ? '↓' : '→'} ${item.diff.value}%
      </div>
      <div class="tn-normal">${item.normal}</div>
    </div>
  `).join('');
}

// ---- Charts ----
function getChartColors(isDark) {
  return {
    grid: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)',
    tick: isDark ? '#8DA3C4' : '#64748b',
    tooltip: isDark ? '#1c2537' : '#fff',
  };
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function renderCharts() {
  const { weather, aqi } = state;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const colors = getChartColors(isDark);
  const units = state.settings.units;

  const labels = weather.hourly.slice(0, 24).map((h, i) => i % 3 === 0 ? formatHour(h.time) : '');

  // AQI Trend
  renderLineChart('chart-aqi', {
    labels,
    data: aqi?.hourlyAqi?.slice(0, 24).map(h => h.aqi) || weather.hourly.slice(0, 24).map(() => 78),
    color: '#eab308',
    label: 'AQI',
    colors,
    yLabel: 'AQI',
    fillColor: 'rgba(234,179,8,.15)',
  });

  // Temperature Trend
  renderLineChart('chart-temp', {
    labels,
    data: weather.hourly.slice(0, 24).map(h => convertTemp(h.temp, units.temperature)),
    color: '#f97316',
    label: `Temperature (${tempUnit(units.temperature)})`,
    colors,
    yLabel: tempUnit(units.temperature),
    fillColor: 'rgba(249,115,22,.15)',
  });

  // Humidity Trend
  renderLineChart('chart-humidity', {
    labels,
    data: weather.hourly.slice(0, 24).map(h => h.humidity),
    color: '#3b82f6',
    label: 'Humidity (%)',
    colors,
    yLabel: '%',
    fillColor: 'rgba(59,130,246,.15)',
  });

  // Wind Trend
  renderLineChart('chart-wind', {
    labels,
    data: weather.hourly.slice(0, 24).map(h => convertWind(h.windSpeed, units.wind)),
    color: '#8b5cf6',
    label: `Wind (${windUnit(units.wind)})`,
    colors,
    yLabel: windUnit(units.wind),
    fillColor: 'rgba(139,92,246,.15)',
  });

  // 7-day AQI bar chart
  render7DayAQI(isDark, colors);
}

function renderLineChart(canvasId, { labels, data, color, label, colors, yLabel, fillColor }) {
  destroyChart(canvasId);
  const canvas = el(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: fillColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltip,
          titleColor: color,
          bodyColor: colors.tick,
          borderColor: color,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => labels.find((l, i) => i === items[0].dataIndex) || '',
          },
        },
      },
      scales: {
        x: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: { color: colors.tick, font: { size: 11 }, maxTicksLimit: 8 },
          border: { display: false },
        },
        y: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: { color: colors.tick, font: { size: 11 } },
          border: { display: false },
          title: { display: true, text: yLabel, color: colors.tick, font: { size: 11 } },
        },
      },
    },
  });
}

function render7DayAQI(isDark, colors) {
  destroyChart('chart-aqi-7day');
  const canvas = el('chart-aqi-7day');
  if (!canvas) return;

  const { weather, aqi } = state;
  const daily7 = aqi?.daily7 || Array.from({ length: 7 }, (_, i) => ({ day: i, avg: 60 + Math.random() * 30 }));

  const days = ['Today', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const aqiColors = daily7.map(d => {
    if (d.avg <= 50) return '#22c55e';
    if (d.avg <= 100) return '#eab308';
    if (d.avg <= 150) return '#f97316';
    return '#ef4444';
  });

  const ctx = canvas.getContext('2d');
  charts['chart-aqi-7day'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.slice(0, daily7.length),
      datasets: [{
        label: 'AQI',
        data: daily7.map(d => d.avg),
        backgroundColor: aqiColors,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltip,
          bodyColor: colors.tick,
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.tick, font: { size: 11 } },
          border: { display: false },
        },
        y: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: { color: colors.tick, font: { size: 11 } },
          border: { display: false },
          min: 0,
          max: 200,
        },
      },
    },
  });
}

// ---- Health Advisory ----
function renderHealthAdvisory() {
  const aqiVal = state.aqi?.current.aqi || 78;
  const advisory = getHealthAdvisory(aqiVal);
  const container = el('health-advisory-insights');
  if (!container) return;

  container.style.background = advisory.bgColor;
  container.innerHTML = `
    <div style="flex:1">
      <div class="ha-badge" style="background:rgba(168,85,247,.15);color:${advisory.color};margin-bottom:8px">${advisory.level}</div>
      <div style="font-weight:600;margin-bottom:4px">Health Advisory</div>
      <div class="ha-text">${advisory.text}</div>
    </div>
    <div class="ha-illustration">😷</div>
  `;
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

  const container = el('outdoor-recs-insights');
  if (!container) return;
  container.innerHTML = recs.map(r => `
    <div class="rec-item">
      <div class="ri-icon">${r.icon}</div>
      <div class="ri-name">${r.name}</div>
      <div class="ri-status ${r.status.toLowerCase()}" style="color:${r.color}">${r.status}</div>
      <div style="font-size:10px;opacity:.5;margin-top:2px">
        ${r.status === 'Excellent' ? 'Great conditions!' : r.status === 'Good' ? 'Good conditions' : r.status === 'Fair' ? 'Use caution' : 'Stay indoors'}
      </div>
    </div>
  `).join('');
}

// Safe boot — ES modules are deferred, DOMContentLoaded may already have fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
