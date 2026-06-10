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

// Rain uses RainViewer (URL set at runtime). Other layers use Open-Meteo data
// rendered as custom canvas overlays — OWM demo-key tiles bake
// "Zoom Level Not Supported" text into every image above zoom 2.
const LAYER_CONFIGS = {
  rain:   { label:'Rain',        icon:'rain',   isTile:true,  url:null, attribution:'© RainViewer', opacity:0.7 },
  clouds: { label:'Clouds',      icon:'clouds', isTile:false, unit:'%',    field:'cloud_cover',    colorFn: cloudColor  },
  wind:   { label:'Wind',        icon:'wind',   isTile:false, unit:'km/h', field:'wind_speed_10m', colorFn: windColor   },
  aqi:    { label:'AQI',         icon:'aqi',    isTile:false, unit:'AQI',  field:'aqi',            colorFn: aqiColor    },
  temp:   { label:'Temperature', icon:'temp',   isTile:false, unit:'°C',   field:'temperature_2m', colorFn: tempColor   },
};

// ── Colour helpers for custom overlay layers ─────────────────────────────
function cloudColor(v)  { if(v<20) return '#93c5fd'; if(v<50) return '#60a5fa'; if(v<80) return '#3b82f6'; return '#1d4ed8'; }
function windColor(v)   { if(v<10) return '#22c55e'; if(v<30) return '#eab308'; if(v<60) return '#f97316'; return '#ef4444'; }
function aqiColor(v)    { if(v<=50) return '#22c55e'; if(v<=100) return '#eab308'; if(v<=150) return '#f97316'; if(v<=200) return '#ef4444'; return '#7c3aed'; }
function tempColor(v)   { if(v<5) return '#3b82f6'; if(v<15) return '#06b6d4'; if(v<25) return '#22c55e'; if(v<32) return '#eab308'; return '#ef4444'; }

// Active custom overlay group (L.layerGroup for non-tile layers)
let customOverlay = null;

/**
 * Fetch the most recent radar frame from the RainViewer public API and update
 * LAYER_CONFIGS.rain.url with a real timestamped tile URL.
 *
 * The static coverage/0 URL (timestamp 0) is invalid — RainViewer returns tiles
 * with "Zoom not supported" text baked into the image at every zoom level.
 * Using an actual past-frame timestamp gives clean precipitation radar tiles
 * that work from zoom 1 to 18 with no embedded error text.
 */
async function fetchLatestRainViewerFrame() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const json = await res.json();
    const frames = json.radar?.past ?? [];
    if (!frames.length) return;
    const latest = frames[frames.length - 1];
    // path looks like: /v2/radar/1234567890
    LAYER_CONFIGS.rain.url = `https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
  } catch {
    // Network unavailable — rain layer simply stays null and is skipped
    console.warn('[Radar] Could not fetch RainViewer frame; rain layer disabled.');
  }
}

// ── Boot: ES modules are deferred — DOMContentLoaded may have already fired
async function init() {
  state.settings = Storage.getSettings();

  const theme = state.settings.theme;
  const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedTheme = theme === 'system' ? (isDarkSystem ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', resolvedTheme);

  await loadLocationAndData();

  // Resolve a real RainViewer tile URL before the map is built so the
  // rain layer works immediately without an extra reload.
  await fetchLatestRainViewerFrame();

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
    zoom: 7,
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

  // Fix scroll-wheel zoom: the parent .main-content is scrollable and captures
  // wheel events before they reach Leaflet. Stopping propagation here gives
  // Leaflet exclusive control over wheel events while the cursor is on the map.
  mapEl?.addEventListener('wheel', e => e.stopPropagation(), { passive: false });

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

// ── Layer switching: tiles for rain, custom canvas for all others ─────────
function addWeatherLayer(type) {
  // Remove old tile layer
  if (layers.active) { map.removeLayer(layers.active); layers.active = null; }
  // Remove old custom overlay
  if (customOverlay) { map.removeLayer(customOverlay); customOverlay = null; }

  const config = LAYER_CONFIGS[type];
  if (!config) return;

  if (config.isTile) {
    // RainViewer tile layer
    if (!config.url) return;
    try {
      const tl = L.tileLayer(config.url, {
        opacity: config.opacity,
        attribution: config.attribution,
        errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        maxNativeZoom: 18,
      });
      tl.addTo(map);
      layers.active = tl;
      tl.on('tileerror', () => {});
    } catch(e) { console.warn('[Radar] Tile layer error:', e); }
  } else {
    // Custom Open-Meteo canvas overlay — no OWM demo tile issues
    addCustomOverlay(type);
  }
}

// ── Open-Meteo powered custom overlay ─────────────────────────────────────
// Fetches a 3×3 grid of points around the current map center and renders
// coloured circle markers with the actual metric values.
async function addCustomOverlay(type) {
  const config = LAYER_CONFIGS[type];
  const center = map.getCenter();
  const lat = center.lat, lon = center.lng;

  // Show loading indicator on the layer button
  const btn = document.querySelector(`.layer-btn[data-layer="${type}"]`);
  if (btn) btn.classList.add('layer-loading');

  try {
    // 3×3 grid, ~1.5° apart (≈165 km)
    const offsets = [-1.5, 0, 1.5];
    const points = [];
    for (const dlat of offsets) for (const dlon of offsets) {
      points.push({ lat: lat+dlat, lon: lon+dlon });
    }

    // Batch via Promise.all — Open-Meteo allows many parallel requests
    const results = await Promise.all(points.map(async p => {
      try {
        const fields = type === 'aqi'
          ? null  // AQI uses separate endpoint
          : [config.field, 'wind_direction_10m'].filter(Boolean).join(',');

        if (type === 'aqi') {
          const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.lat}&longitude=${p.lon}&current=us_aqi&hourly=us_aqi&forecast_days=1`;
          const res = await fetch(url);
          const d   = await res.json();
          return { ...p, value: d.current?.us_aqi ?? null };
        } else {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=${fields}&forecast_days=1`;
          const res = await fetch(url);
          const d   = await res.json();
          const raw = d.current?.[config.field];
          const windDir = d.current?.wind_direction_10m ?? null;
          return { ...p, value: raw ?? null, windDir };
        }
      } catch { return { ...p, value: null }; }
    }));

    customOverlay = L.layerGroup();

    for (const pt of results) {
      if (pt.value === null) continue;
      const v     = Math.round(pt.value * 10) / 10;
      const color = config.colorFn(v);

      // Translucent filled circle covering ~80 km radius
      L.circle([pt.lat, pt.lon], {
        radius: 80000,
        color,
        fillColor: color,
        fillOpacity: 0.18,
        weight: 1,
        opacity: 0.4,
      }).addTo(customOverlay);

      // Value label marker
      const labelHtml = type === 'wind'
        ? buildWindMarker(v, pt.windDir, color)
        : buildValueMarker(v, config.unit, color);

      L.marker([pt.lat, pt.lon], {
        icon: L.divIcon({
          className: '',
          html: labelHtml,
          iconSize:   [80, 44],
          iconAnchor: [40, 22],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(customOverlay);
    }

    customOverlay.addTo(map);
    updateLayerLegend(type);
  } catch(e) {
    console.warn('[Radar] Custom overlay error:', e);
  } finally {
    if (btn) btn.classList.remove('layer-loading');
  }
}

function buildValueMarker(value, unit, color) {
  return `<div style="
    background:${color};color:#fff;
    padding:4px 8px;border-radius:8px;
    font-size:13px;font-weight:700;
    text-align:center;white-space:nowrap;
    box-shadow:0 2px 6px rgba(0,0,0,.4);
    pointer-events:none;
  ">${value}<span style="font-size:10px;font-weight:400;opacity:.85"> ${unit}</span></div>`;
}

function buildWindMarker(speed, dir, color) {
  const arrow = dir !== null
    ? `<div style="transform:rotate(${dir}deg);font-size:16px;line-height:1">↑</div>`
    : '';
  return `<div style="
    background:${color};color:#fff;
    padding:4px 8px;border-radius:8px;
    font-size:13px;font-weight:700;
    text-align:center;white-space:nowrap;
    box-shadow:0 2px 6px rgba(0,0,0,.4);
    pointer-events:none;
  ">${arrow}${speed}<span style="font-size:10px;font-weight:400;opacity:.85"> km/h</span></div>`;
}

function updateLayerLegend(type) {
  const legends = {
    clouds: [{c:'#93c5fd',l:'<20%'},{c:'#60a5fa',l:'20–50%'},{c:'#3b82f6',l:'50–80%'},{c:'#1d4ed8',l:'>80%'}],
    wind:   [{c:'#22c55e',l:'<10'},{c:'#eab308',l:'10–30'},{c:'#f97316',l:'30–60'},{c:'#ef4444',l:'>60 km/h'}],
    aqi:    [{c:'#22c55e',l:'Good'},{c:'#eab308',l:'Mod.'},{c:'#f97316',l:'Unhlthy'},{c:'#ef4444',l:'V.Unhlthy'},{c:'#7c3aed',l:'Hazard'}],
    temp:   [{c:'#3b82f6',l:'<5°C'},{c:'#06b6d4',l:'5–15°C'},{c:'#22c55e',l:'15–25°C'},{c:'#eab308',l:'25–32°C'},{c:'#ef4444',l:'>32°C'}],
  };
  const items = legends[type] || [];
  const bar = document.getElementById('layer-legend-bar');
  if (!bar) return;
  bar.innerHTML = items.map(i =>
    `<span class="legend-item"><span class="legend-dot" style="background:${i.c}"></span>${i.l}</span>`
  ).join('');
  bar.style.display = items.length ? '' : 'none';
}

function setupLayerButtons() {
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.layer;
      currentLayer = type;
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      addWeatherLayer(type);
      // Hide legend for rain (tile layer), show for others
      const bar = document.getElementById('layer-legend-bar');
      if (bar) bar.style.display = type === 'rain' ? 'none' : '';
    });
  });
  // Re-fetch custom overlays when user pans/zooms so data stays relevant
  map.on('moveend', () => {
    if (LAYER_CONFIGS[currentLayer] && !LAYER_CONFIGS[currentLayer].isTile) {
      addCustomOverlay(currentLayer);
    }
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
      <div style="margin-top:8px">${next === -1 ? '☀️' : precipPct > 60 ? '🌧️' : '🌦️'}</div>
    `;
  }
}

// Safe boot — ES modules are deferred; DOMContentLoaded may already have fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
