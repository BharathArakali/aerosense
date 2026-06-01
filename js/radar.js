/* ============================================================
   AeroSense – radar.js
   Leaflet.js map with weather overlay layers & timeline
   ============================================================ */

import Storage from './storage.js';
import { getAQILabel, calcAeroScore, getAeroScoreLabel, buildSparkline } from './utils.js';
import { fetchWeather } from './weather.js';
import { fetchAQI } from './aqi.js';

let map = null;
let locationMarker = null;
let currentLayer = 'rain';
let layers = {};
let state = { weather: null, aqi: null, location: null, settings: null };

const LAYER_CONFIGS = {
  rain: {
    label: 'Rain', icon: '💧',
    url: 'https://tilecache.rainviewer.com/v2/coverage/0/256/{z}/{x}/{y}/2/1_1.png',
    attribution: '© RainViewer', opacity: 0.7, fallback: true,
  },
  clouds: {
    label: 'Clouds', icon: '☁️',
    url: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=demo',
    attribution: '© OpenWeatherMap', opacity: 0.6, fallback: true,
  },
  wind: {
    label: 'Wind', icon: '💨',
    url: 'https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=demo',
    attribution: '© OpenWeatherMap', opacity: 0.65, fallback: true,
  },
  aqi: {
    label: 'AQI', icon: '🌿',
    url: null,
    attribution: '© AeroSense', opacity: 0.5, fallback: true,
  },
  temp: {
    label: 'Temp', icon: '🌡',
    url: 'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=demo',
    attribution: '© OpenWeatherMap', opacity: 0.6, fallback: true,
  },
};

// ── Boot: ES modules are deferred — DOMContentLoaded may have already fired
async function init() {
  state.settings = Storage.getSettings();

  const theme = state.settings.theme;
  const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedTheme = theme === 'system' ? (isDarkSystem ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', resolvedTheme);

  await loadLocationAndData();
  initMap();
  setupLayerButtons();
  setupTimeline();
  setupMapControls();
}

async function loadLocationAndData() {
  const loc = Storage.getCachedLocation();
  if (loc) {
    state.location = loc;
    const cw = Storage.getCachedWeather();
    const ca = Storage.getCachedAQI();
    state.weather = cw?.data;
    state.aqi = ca?.data;
  } else {
    state.location = { lat: 12.9716, lon: 77.5946, name: 'Bengaluru, KA' };
  }
  updateRadarSidebar();
}

function initMap() {
  const { lat, lon } = state.location;

  // Give the map element an explicit pixel height before Leaflet reads it.
  // height:100% requires a resolved parent; this avoids a blank/zero-height map.
  const mapEl = document.getElementById('map');
  if (mapEl) {
    const wrapper = mapEl.closest('.map-wrapper');
    const wrapH = wrapper ? wrapper.getBoundingClientRect().height : 0;
    const fallbackH = window.innerWidth <= 768 ? 340 : 520;
    mapEl.style.height = (wrapH > 10 ? wrapH : fallbackH) + 'px';
    mapEl.style.width = '100%';
    mapEl.style.position = 'relative';
  }

  map = L.map('map', {
    center: [lat, lon],
    zoom: 10,
    zoomControl: false,
    attributionControl: false,
    tap: false,           // prevents "Zoom not supported" on iOS
    tapTolerance: 15,
    touchZoom: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    dragging: true,
    bounceAtZoomLimits: false,
  });

  // Force Leaflet to recalculate size after first render tick
  requestAnimationFrame(() => {
    setTimeout(() => { if (map) map.invalidateSize({ animate: false }); }, 100);
  });

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const baseUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  L.tileLayer(baseUrl, {
    attribution: '© OSM contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 18,
  }).addTo(map);

  // Small attribution
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

  // Custom location marker — blue pulsing dot
  const markerIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;
      border-radius:50%;
      background:#3b82f6;
      border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(59,130,246,.4),0 0 0 8px rgba(59,130,246,.15);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  locationMarker = L.marker([lat, lon], { icon: markerIcon }).addTo(map);
  locationMarker.bindPopup(`<b>${state.location.name || 'Your Location'}</b>`);

  // Initial weather layer
  addWeatherLayer('rain');
}

function addWeatherLayer(type) {
  if (layers.active) { map.removeLayer(layers.active); layers.active = null; }
  const config = LAYER_CONFIGS[type];
  if (!config || !config.url) return;
  try {
    const tl = L.tileLayer(config.url, {
      opacity: config.opacity,
      attribution: config.attribution,
      errorTileUrl: '',
    });
    tl.addTo(map);
    layers.active = tl;
    tl.on('tileerror', () => {}); // silently ignore tile errors (demo API keys)
  } catch (e) {
    console.warn('[Radar] Layer error:', e);
  }
}

function setupLayerButtons() {
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.layer;
      currentLayer = type;
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      addWeatherLayer(type);
    });
  });
  const rainBtn = document.querySelector('[data-layer="rain"]');
  if (rainBtn) rainBtn.classList.add('active');
}

function setupTimeline() {
  const slider  = document.getElementById('timeline-slider');
  const timeLabel = document.getElementById('timeline-time');
  const slider2 = document.getElementById('timeline-slider-2');
  const timeLabel2 = document.getElementById('timeline-time-2');
  if (!slider) return;

  const now = new Date();

  function updateTimeLabel(val, labelEl, nowBtnId) {
    if (!labelEl) return;
    const offset = parseInt(val) - 2; // -2h … +2h
    const nowBtn = document.getElementById(nowBtnId);
    if (offset === 0) {
      labelEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      nowBtn?.classList.add('hidden');
    } else {
      const t = new Date(now.getTime() + offset * 3_600_000);
      labelEl.textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      nowBtn?.classList.remove('hidden');
    }
    if (layers.active) {
      const base = LAYER_CONFIGS[currentLayer]?.opacity || 0.6;
      layers.active.setOpacity(Math.max(0.3, base * (1 - Math.abs(offset) * 0.1)));
    }
  }

  slider.value = 2;
  updateTimeLabel(2, timeLabel, 'timeline-now-btn');

  slider.addEventListener('input', e => {
    updateTimeLabel(e.target.value, timeLabel, 'timeline-now-btn');
    if (slider2) slider2.value = e.target.value;
    updateTimeLabel(e.target.value, timeLabel2, 'timeline-now-btn-2');
  });

  if (slider2) {
    slider2.value = 2;
    updateTimeLabel(2, timeLabel2, 'timeline-now-btn-2');
    slider2.addEventListener('input', e => {
      slider.value = e.target.value;
      updateTimeLabel(e.target.value, timeLabel, 'timeline-now-btn');
      updateTimeLabel(e.target.value, timeLabel2, 'timeline-now-btn-2');
    });
  }

  ['timeline-now-btn', 'timeline-now-btn-2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
      slider.value = 2; if (slider2) slider2.value = 2;
      updateTimeLabel(2, timeLabel, 'timeline-now-btn');
      updateTimeLabel(2, timeLabel2, 'timeline-now-btn-2');
    });
  });
}

function setupMapControls() {
  document.getElementById('zoom-in')?.addEventListener('click', () => map?.zoomIn());
  document.getElementById('zoom-out')?.addEventListener('click', () => map?.zoomOut());
  document.getElementById('map-recenter')?.addEventListener('click', () => {
    if (map && state.location) map.flyTo([state.location.lat, state.location.lon], 10, { duration: 1 });
  });
}

function updateRadarSidebar() {
  const w = state.weather;
  const a = state.aqi;
  if (!w || !a) return;

  const score = calcAeroScore({
    aqi: a.current.aqi, temp: w.current.temp,
    humidity: w.current.humidity, uv: w.current.uvIndex, wind: w.current.windSpeed,
  });
  const info = getAeroScoreLabel(score);

  ['radar-aeroscore', 'radar-aeroscore-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `
      <div class="sc-label">AeroScore™</div>
      <div class="sc-value" style="color:${info.color}">${score}<span>/100</span></div>
      <div class="sc-status" style="color:${info.color}">${info.label}</div>`;
  });

  ['radar-score-spark', 'radar-score-spark-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el && w.hourly) {
      const vals = w.hourly.slice(0, 8).map(h => calcAeroScore({
        aqi: a.current.aqi, temp: h.temp, humidity: h.humidity,
        uv: h.uvIndex, wind: h.windSpeed,
      }));
      buildSparkline(el, vals, info.color);
    }
  });

  const rainInfo = document.getElementById('rain-info');
  if (rainInfo) {
    const next = w.hourly?.findIndex(h => h.precipProb >= 40) ?? -1;
    const timeStr = next === -1
      ? 'No rain expected'
      : next === 0
        ? 'Rain now'
        : `in ${next}h`;
    const precipPct = next >= 0 ? w.hourly[next].precipProb : 0;
    rainInfo.innerHTML = `
      <div style="font-size:var(--text-sm);opacity:.6;margin-bottom:6px">Next precipitation</div>
      <div style="font-size:var(--text-xl);font-weight:700;color:var(--color-brand);margin-bottom:4px">${timeStr}</div>
      ${precipPct > 0 ? `<div style="font-size:var(--text-sm);opacity:.6">${precipPct}% chance of rain</div>` : ''}
      <div style="margin-top:8px;font-size:2rem">${next === -1 ? '☀️' : precipPct > 60 ? '🌧' : '🌦'}</div>
    `;
  }
}

// Safe boot — ES modules are deferred; DOMContentLoaded may already have fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
