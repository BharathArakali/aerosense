/* ============================================================
   AeroSense – utils.js
   Utility functions shared across modules
   ============================================================ */

// ---- Weather Code → Emoji + Description ----
export const WMO_CODES = {
  0:  { icon: '☀️',  desc: 'Clear Sky',       bg: 'sunny' },
  1:  { icon: '🌤',  desc: 'Mainly Clear',    bg: 'sunny' },
  2:  { icon: '⛅',  desc: 'Partly Cloudy',   bg: 'cloudy' },
  3:  { icon: '☁️',  desc: 'Overcast',        bg: 'cloudy' },
  45: { icon: '🌫',  desc: 'Foggy',           bg: 'fog' },
  48: { icon: '🌫',  desc: 'Depositing Rime', bg: 'fog' },
  51: { icon: '🌦',  desc: 'Light Drizzle',   bg: 'rainy' },
  53: { icon: '🌦',  desc: 'Drizzle',         bg: 'rainy' },
  55: { icon: '🌧',  desc: 'Heavy Drizzle',   bg: 'rainy' },
  61: { icon: '🌧',  desc: 'Slight Rain',     bg: 'rainy' },
  63: { icon: '🌧',  desc: 'Rain',            bg: 'rainy' },
  65: { icon: '🌧',  desc: 'Heavy Rain',      bg: 'rainy' },
  71: { icon: '🌨',  desc: 'Slight Snow',     bg: 'snow' },
  73: { icon: '❄️',  desc: 'Snow',            bg: 'snow' },
  75: { icon: '❄️',  desc: 'Heavy Snow',      bg: 'snow' },
  77: { icon: '🌨',  desc: 'Snow Grains',     bg: 'snow' },
  80: { icon: '🌦',  desc: 'Slight Showers',  bg: 'rainy' },
  81: { icon: '🌧',  desc: 'Rain Showers',    bg: 'rainy' },
  82: { icon: '⛈',  desc: 'Heavy Showers',   bg: 'rainy' },
  85: { icon: '🌨',  desc: 'Snow Showers',    bg: 'snow' },
  86: { icon: '❄️',  desc: 'Heavy Snow Showers', bg: 'snow' },
  95: { icon: '⛈',  desc: 'Thunderstorm',    bg: 'thunderstorm' },
  96: { icon: '⛈',  desc: 'Thunderstorm + Hail', bg: 'thunderstorm' },
  99: { icon: '⛈',  desc: 'Heavy Thunderstorm + Hail', bg: 'thunderstorm' },
};

export function getWeatherInfo(code, isDay = true) {
  const info = WMO_CODES[code] || { icon: '🌡', desc: 'Unknown', bg: 'cloudy' };
  if (!isDay && (code === 0 || code === 1)) {
    return { icon: '🌙', desc: 'Clear Night', bg: 'night-clear' };
  }
  return info;
}

// ---- AQI Helpers ----
export function getAQILabel(aqi) {
  if (aqi <= 50)  return { label: 'Good',                 color: '#22C55E', level: 'good' };
  if (aqi <= 100) return { label: 'Moderate',             color: '#FACC15', level: 'moderate' };
  if (aqi <= 150) return { label: 'Unhealthy (Sensitive)',color: '#FB923C', level: 'fair' };
  if (aqi <= 200) return { label: 'Unhealthy',            color: '#EF4444', level: 'poor' };
  if (aqi <= 300) return { label: 'Very Unhealthy',       color: '#A855F7', level: 'very-poor' };
  return { label: 'Hazardous',                            color: '#7F1D1D', level: 'hazardous' };
}

export function aqiToPercent(aqi) {
  return Math.min(Math.max(aqi / 500, 0), 1) * 100;
}

// ---- UV Index ----
export function getUVLabel(uv) {
  if (uv <= 2)  return { label: 'Low',       color: '#22C55E' };
  if (uv <= 5)  return { label: 'Moderate',  color: '#FACC15' };
  if (uv <= 7)  return { label: 'High',      color: '#FB923C' };
  if (uv <= 10) return { label: 'Very High', color: '#EF4444' };
  return { label: 'Extreme', color: '#A855F7' };
}

// ---- AeroScore Calculation ----
export function calcAeroScore({ aqi, temp, humidity, uv, wind }) {
  // Each component scored 0-20 (5 components = 100 max)
  let score = 100;

  // AQI (0-500): best ≤50, penalize above
  const aqiPenalty = aqi <= 50 ? 0 : aqi <= 100 ? 10 : aqi <= 150 ? 20 : aqi <= 200 ? 35 : 50;
  score -= aqiPenalty;

  // Temp (°C): ideal 18-28
  const tempDev = Math.min(Math.abs(temp - 23) / 5, 3) * 5;
  score -= tempDev;

  // Humidity (%): ideal 40-60
  const humDev = humidity < 20 || humidity > 80 ? 15 : humidity < 30 || humidity > 70 ? 8 : humidity < 40 || humidity > 60 ? 3 : 0;
  score -= humDev;

  // UV: ideal ≤3
  const uvPenalty = uv <= 2 ? 0 : uv <= 5 ? 3 : uv <= 7 ? 8 : uv <= 10 ? 15 : 22;
  score -= uvPenalty;

  // Wind (km/h): ideal < 20
  const windPenalty = wind < 10 ? 0 : wind < 20 ? 2 : wind < 40 ? 6 : wind < 60 ? 12 : 18;
  score -= windPenalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getAeroScoreLabel(score) {
  if (score >= 76) return { label: 'Good Conditions',  color: '#22C55E' };
  if (score >= 51) return { label: 'Fair Conditions',  color: '#FACC15' };
  if (score >= 26) return { label: 'Poor Conditions',  color: '#F59E0B' };
  return { label: 'Hazardous Conditions', color: '#EF4444' };
}

// ---- Comfort Score ----
export function calcComfortScore({ temp, humidity, wind }) {
  // Heat index approximation & comfort range
  let score = 100;

  // Temp comfort: ideal 20-26
  const tempC = Math.min(Math.abs(temp - 23) / 4, 4) * 8;
  score -= tempC;

  // Humidity: ideal 40-55
  const humC = humidity < 25 || humidity > 75 ? 18 : humidity < 35 || humidity > 65 ? 8 : 0;
  score -= humC;

  // Wind chill/comfort
  const windC = wind > 30 ? 10 : wind > 50 ? 18 : 0;
  score -= windC;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getComfortLabel(score) {
  if (score >= 80) return { label: 'Comfortable',     color: '#22c55e' };
  if (score >= 60) return { label: 'Mostly Comfortable', color: '#eab308' };
  if (score >= 40) return { label: 'Uncomfortable',   color: '#f97316' };
  return { label: 'Very Uncomfortable', color: '#ef4444' };
}

// ---- Outdoor Recommendations ----
export function getOutdoorRecs({ aqi, uv, wind, temp }) {
  const activities = [
    { name: 'Walking',       icon: '🚶', thresholds: { aqi: 150, uv: 10, wind: 50, tempMin: 5, tempMax: 40 } },
    { name: 'Running',       icon: '🏃', thresholds: { aqi: 100, uv: 8,  wind: 40, tempMin: 5, tempMax: 35 } },
    { name: 'Cycling',       icon: '🚴', thresholds: { aqi: 100, uv: 8,  wind: 35, tempMin: 5, tempMax: 38 } },
    { name: 'Outdoor Sports',icon: '⛹️', thresholds: { aqi: 100, uv: 8,  wind: 40, tempMin: 8, tempMax: 38 } },
    { name: 'Picnic',        icon: '🧺', thresholds: { aqi: 75,  uv: 7,  wind: 30, tempMin: 12, tempMax: 35 } },
  ];

  return activities.map(act => {
    const { thresholds } = act;
    let penalty = 0;
    if (aqi > thresholds.aqi) penalty += 3;
    else if (aqi > thresholds.aqi * 0.7) penalty += 1;
    if (uv > thresholds.uv) penalty += 2;
    else if (uv > thresholds.uv * 0.75) penalty += 1;
    if (wind > thresholds.wind) penalty += 2;
    if (temp < thresholds.tempMin || temp > thresholds.tempMax) penalty += 3;

    let status, color;
    if (penalty === 0) { status = 'Excellent'; color = '#22c55e'; }
    else if (penalty <= 1) { status = 'Good'; color = '#3b82f6'; }
    else if (penalty <= 3) { status = 'Fair'; color = '#f97316'; }
    else { status = 'Avoid'; color = '#ef4444'; }

    return { ...act, status, color };
  });
}

// ---- Unit Conversions ----
export function convertTemp(celsius, unit) {
  if (unit === 'F') return Math.round(celsius * 9/5 + 32);
  return Math.round(celsius);
}
export function tempUnit(unit) { return unit === 'F' ? '°F' : '°C'; }

export function convertWind(kmh, unit) {
  if (unit === 'mph') return Math.round(kmh * 0.621);
  if (unit === 'ms') return Math.round(kmh / 3.6 * 10) / 10;
  if (unit === 'knots') return Math.round(kmh * 0.540);
  return Math.round(kmh);
}
export function windUnit(unit) {
  const map = { kmh: 'km/h', mph: 'mph', ms: 'm/s', knots: 'kn' };
  return map[unit] || 'km/h';
}

export function convertPressure(hPa, unit) {
  if (unit === 'inHg') return (hPa * 0.02953).toFixed(2);
  if (unit === 'mb') return Math.round(hPa);
  return Math.round(hPa);
}
export function pressureUnit(unit) {
  const map = { hPa: 'hPa', inHg: 'inHg', mb: 'mb' };
  return map[unit] || 'hPa';
}

export function convertDistance(km, unit) {
  if (unit === 'mi') return (km * 0.621).toFixed(1);
  return km;
}
export function distanceUnit(unit) { return unit === 'mi' ? 'mi' : 'km'; }

// ---- Time Formatting ----
export function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatHour(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: 'numeric', hour12: true }).replace(' ', '');
}

export function formatDay(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short' });
}

export function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatSunTime(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ---- Historical Comparison ----
export function calcHistoricalNormals(history, field) {
  if (!history.length) return { avg7: null, avg30: null, avg90: null };
  const last = (n) => history.slice(-n).map(h => h[field]).filter(v => v !== undefined);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  return {
    avg7: avg(last(7)),
    avg30: avg(last(30)),
    avg90: avg(last(90)),
  };
}

export function percentDiff(current, normal) {
  if (!normal || normal === 0) return { value: 0, dir: 'normal' };
  const pct = ((current - normal) / normal * 100);
  return {
    value: Math.abs(pct).toFixed(1),
    dir: pct > 2 ? 'up' : pct < -2 ? 'down' : 'normal',
  };
}

// ---- DOM Helpers ----
export function el(id) { return document.getElementById(id); }
export function qs(sel, parent = document) { return parent.querySelector(sel); }
export function qsa(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

export function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---- Geocoding (Open-Meteo Geocoding API) ----
export async function geocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results || [];
}

export async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || 'Unknown';
    const state = data.address?.state_code || data.address?.state || '';
    return `${city}${state ? ', ' + state : ''}`;
  } catch {
    return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }
}

// ---- SVG Gauge Ring ----
export function buildGaugeRing(svgEl, value, max, color) {
  const size = 60, r = 22, cx = 30, cy = 30;
  const circ = 2 * Math.PI * r;
  const pct = clamp(value / max, 0, 1);
  const dashOffset = circ * (1 - pct);
  svgEl.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(128,128,128,.18)" stroke-width="5"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${circ}" stroke-dashoffset="${dashOffset}"
        stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
        class="gauge-ring-circle" style="transition:stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)"/>
    </svg>`;
}

// ---- Mini Sparkline ----
export function buildSparkline(container, values, color = '#3b82f6') {
  if (!values || values.length < 2) return;
  const w = container.clientWidth || 80;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const d = `M${pts.join('L')}`;
  const areaD = `M${pts[0]}L${pts.join('L')}L${w},${h}L0,${h}Z`;

  container.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="sparkline-svg">
      <defs>
        <linearGradient id="sg${Math.random().toString(36).slice(2)}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="${color}" opacity="0.15" class="sparkline-area"/>
      <path d="${d}" stroke="${color}" stroke-width="1.5" fill="none" class="sparkline-path"/>
    </svg>
  `;
}
