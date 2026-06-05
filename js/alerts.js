/* ============================================================
   AeroSense – alerts.js
   Alerts page: active/upcoming alerts, notification toggles
   ============================================================ */

import Storage from './storage.js';
import { getAQILabel, getUVLabel, el, qs, qsa } from './utils.js';

let state = {
  settings: null,
  alertPrefs: null,
  activeFilter: 'all',
  weather: null,
  aqi: null,
};

async function init() {
  state.settings = Storage.getSettings();
  // Guard: older stored settings may lack alertPrefs
  state.alertPrefs = state.settings.alertPrefs || {
    rain: true, aqi: true, uv: true, wind: false, severe: true,
  };
  applyTheme(state.settings.theme);

  const cw = Storage.getCachedWeather();
  const ca = Storage.getCachedAQI();
  state.weather = cw?.data;
  state.aqi = ca?.data;

  renderAll();
  setupEventListeners();
}

function applyTheme(theme) {
  const isDark = theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// ---- Alert Data ----
function buildAlerts() {
  const w = state.weather;
  const a = state.aqi;
  const aqiVal = a?.current?.aqi || 78;
  const uvVal = w?.current?.uvIndex || 8;
  const windVal = w?.current?.windSpeed || 14;
  const precipProb = w?.daily?.[0]?.precipProb || 70;

  const allAlerts = [];

  // Active alerts (conditions-based)
  if (precipProb >= 60 || state.alertPrefs.rain) {
    allAlerts.push({
      id: 'rain-active',
      type: 'weather',
      category: 'rain',
      title: 'Heavy Rain Alert',
      desc: 'Heavy rain expected in your area',
      icon: '🌧',
      iconBg: 'rgba(59,130,246,.15)',
      borderColor: '#3b82f6',
      status: 'active',
      badgeColor: '#ef4444',
      time: 'Today, 4:30 PM – 7:30 PM',
      area: 'Affected Areas: Bengaluru, Bengaluru Rural',
      severity: 'active',
    });
  }

  if (windVal >= 30 || true) {
    allAlerts.push({
      id: 'wind-active',
      type: 'wind',
      category: 'wind',
      title: 'Strong Wind Alert',
      desc: `Strong winds with speed up to ${Math.max(40, windVal)} km/h`,
      icon: '💨',
      iconBg: 'rgba(249,115,22,.15)',
      borderColor: '#f97316',
      status: 'active',
      badgeColor: '#f97316',
      time: 'Today, 12:00 PM – 8:00 PM',
      area: 'Affected Areas: Bengaluru',
      severity: 'wind',
    });
  }

  // Upcoming alerts
  allAlerts.push({
    id: 'rain-upcoming',
    type: 'weather',
    category: 'rain',
    title: 'Moderate Rain Expected',
    desc: 'Rain likely to start in your area',
    icon: '🌦',
    iconBg: 'rgba(59,130,246,.1)',
    borderColor: '#3b82f6',
    status: 'upcoming',
    badgeColor: '#3b82f6',
    time: 'Tomorrow, 9:00 AM – 12:00 PM',
    area: '',
    severity: 'upcoming',
  });

  // UV — always present so the UV tab has content; high UV is an active alert
  {
    const high = uvVal >= 7;
    allAlerts.push({
      id: high ? 'uv-active' : 'uv-info',
      type: 'uv',
      category: 'uv',
      title: high ? 'High UV Index' : 'UV Index Normal',
      desc: high
        ? `UV index is high (${Math.round(uvVal)}) — limit midday sun exposure`
        : `UV index is ${Math.round(uvVal)} — low risk outdoors`,
      icon: '☀️',
      iconBg: 'rgba(234,179,8,.15)',
      borderColor: '#eab308',
      status: high ? 'active' : 'upcoming',
      badgeColor: '#eab308',
      time: high ? 'Today, 11:00 AM – 3:00 PM' : 'Tomorrow, 11:00 AM – 3:00 PM',
      area: '',
      severity: 'uv',
    });
  }

  // AQI — always present so the Air Quality tab has content; severity tracks level
  {
    const poor = aqiVal > 100;
    allAlerts.push({
      id: poor ? 'aqi-active' : 'aqi-info',
      type: 'aqi',
      category: 'aqi',
      title: poor ? 'Poor Air Quality' : 'Air Quality Update',
      desc: poor
        ? `AQI is ${aqiVal} — air may be unhealthy, limit outdoor activity`
        : `AQI is ${aqiVal} — air quality is acceptable today`,
      icon: '🌫',
      iconBg: poor ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.12)',
      borderColor: poor ? '#ef4444' : '#22c55e',
      status: poor ? 'active' : 'upcoming',
      badgeColor: poor ? '#ef4444' : '#22c55e',
      time: poor ? 'Today, 8:00 AM – 6:00 PM' : 'Tomorrow, 8:00 AM – 6:00 PM',
      area: '',
      severity: 'aqi',
    });
  }

  return allAlerts;
}

// ---- Render ----
function renderAll() {
  renderAlerts();
  renderAlertSettings();
  renderLocationSummary();
  updateBadgeCount();
}

function renderAlerts() {
  const allAlerts = buildAlerts();
  const filter = state.activeFilter;

  const filtered = filter === 'all'
    ? allAlerts
    : allAlerts.filter(a => a.category === filter || a.type === filter);

  const active = filtered.filter(a => a.status === 'active');
  const upcoming = filtered.filter(a => a.status === 'upcoming');

  const activeContainer = el('active-alerts');
  const upcomingContainer = el('upcoming-alerts');
  if (!activeContainer || !upcomingContainer) return;

  activeContainer.innerHTML = active.length
    ? active.map(a => buildAlertCard(a)).join('')
    : `<div style="padding:var(--space-xl);opacity:.5;text-align:center">No active alerts</div>`;

  upcomingContainer.innerHTML = upcoming.length
    ? upcoming.map(a => buildAlertCard(a)).join('')
    : `<div style="padding:var(--space-xl);opacity:.5;text-align:center">No upcoming alerts</div>`;

  // Wire click/keyboard interactions after DOM is updated
  requestAnimationFrame(wireAlertCards);
}

// Severity → human-readable advice
const ALERT_ADVICE = {
  active:   'Stay indoors if possible. Monitor local news for updates.',
  wind:     'Secure loose outdoor objects. Avoid unnecessary travel.',
  upcoming: 'Prepare in advance. Check back for live updates.',
  uv:       'Wear sunscreen SPF 50+, hat, and UV-blocking sunglasses.',
  aqi:      'Limit outdoor activity. Keep windows closed indoors.',
};

function buildAlertCard(alert) {
  const badgeLabel = alert.status === 'active' ? 'Active' : 'Upcoming';
  const advice = ALERT_ADVICE[alert.severity] || ALERT_ADVICE[alert.status] || '';
  return `
    <div class="alert-card ${alert.severity}" data-id="${alert.id}" style="cursor:pointer" role="button" tabindex="0" aria-expanded="false">
      <div class="ac-main-row">
        <div class="ac-icon-wrap" style="background:${alert.iconBg}">${alert.icon}</div>
        <div class="ac-body">
          <div class="ac-title">${alert.title}</div>
          <div class="ac-desc">${alert.desc}</div>
          <div class="ac-meta">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${alert.time}
            </span>
            ${alert.area ? `<span>📍 ${alert.area}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
          <div class="ac-badge" style="color:${alert.badgeColor};background:${alert.iconBg}">${badgeLabel}</div>
          <svg class="ac-chevron" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="opacity:.5;transition:transform .2s"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>
      <div class="ac-detail" style="display:none;padding-top:12px;border-top:1px solid var(--border-primary);margin-top:12px">
        ${advice ? `<div style="font-size:var(--text-sm);opacity:.8;margin-bottom:8px">💡 ${advice}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="alerts.html" style="font-size:var(--text-xs);font-weight:600;color:var(--color-brand);text-decoration:none;padding:5px 12px;border-radius:99px;border:1px solid var(--color-brand)">View Details</a>
          <button onclick="event.stopPropagation()" style="font-size:var(--text-xs);font-weight:600;color:var(--text-secondary);padding:5px 12px;border-radius:99px;border:1px solid var(--border-primary);background:none;cursor:pointer">Dismiss</button>
        </div>
      </div>
    </div>
  `;
}

function wireAlertCards() {
  qsa('.alert-card[data-id]').forEach(card => {
    if (card._wired) return;
    card._wired = true;
    const toggle = () => {
      const detail = card.querySelector('.ac-detail');
      const chevron = card.querySelector('.ac-chevron');
      const isOpen = detail.style.display !== 'none';
      detail.style.display = isOpen ? 'none' : 'block';
      card.setAttribute('aria-expanded', !isOpen);
      if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    // Dismiss button
    const dismissBtn = card.querySelector('button');
    if (dismissBtn) dismissBtn.addEventListener('click', e => { e.stopPropagation(); card.style.opacity = '0'; card.style.transition = 'opacity .3s'; setTimeout(() => card.remove(), 300); });
  });
}

function renderAlertSettings() {
  const prefs = state.alertPrefs;
  const settingsList = [
    { key: 'rain',   icon: '💧', label: 'Rain Alerts',           desc: 'Get notified about rain in your area',  iconBg: 'rgba(59,130,246,.15)' },
    { key: 'aqi',    icon: '🌿', label: 'Air Quality Alerts',    desc: 'Get notified about poor air quality',   iconBg: 'rgba(34,197,94,.15)' },
    { key: 'uv',     icon: '☀️', label: 'UV Index Alerts',       desc: 'Get notified about high UV index',      iconBg: 'rgba(234,179,8,.15)' },
    { key: 'wind',   icon: '💨', label: 'Wind Alerts',           desc: 'Get notified about strong winds',       iconBg: 'rgba(139,92,246,.15)' },
    { key: 'severe', icon: '⛈', label: 'Severe Weather Alerts', desc: 'Get notified about severe weather',     iconBg: 'rgba(239,68,68,.15)' },
  ];

  const container = el('alert-settings-list');
  if (!container) return;

  container.innerHTML = settingsList.map(s => `
    <div class="alert-setting-row">
      <div class="asr-icon" style="background:${s.iconBg}">${s.icon}</div>
      <div class="asr-body">
        <div class="asr-name">${s.label}</div>
        <div class="asr-desc">${s.desc}</div>
      </div>
      <label class="toggle-switch" aria-label="Toggle ${s.label}">
        <input type="checkbox" data-pref="${s.key}" ${prefs[s.key] ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('');

  // Attach toggle listeners
  container.querySelectorAll('input[type=checkbox]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.pref;
      state.alertPrefs[key] = input.checked;
      const settings = Storage.getSettings();
      settings.alertPrefs = state.alertPrefs;
      Storage.saveSettings(settings);
      state.settings = settings;
      renderAlerts();

      // Request notification permission if enabling
      if (input.checked && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });
  });
}

function renderLocationSummary() {
  const w = state.weather;
  const a = state.aqi;
  if (!w) return;

  const loc = Storage.getCachedLocation();
  const locName = loc?.name || 'Your Location';
  const { current } = w;
  const container = el('alert-location-summary');
  if (!container) return;

  const aqiInfo = getAQILabel(a?.current.aqi || 78);

  container.innerHTML = `
    <div style="font-size:var(--text-xs);opacity:.6;margin-bottom:4px">Active Location</div>
    <div style="font-weight:700;margin-bottom:8px">${locName}</div>
    <div style="font-size:var(--text-2xl);font-weight:800">${current.temp}°C</div>
    <div style="font-size:var(--text-sm);opacity:.7;margin-bottom:8px">Clear Sky</div>
    <div style="font-size:var(--text-lg);font-weight:700;color:${aqiInfo.color}">AQI ${a?.current.aqi || 78}</div>
    <div style="font-size:var(--text-sm);color:${aqiInfo.color}">${aqiInfo.label}</div>
  `;
}

function updateBadgeCount() {
  // The user is on the Alerts page, so mark the current alerts as seen and
  // clear the badge everywhere. It reappears only when a new alert arrives.
  const active = buildAlerts().filter(a => a.status === 'active').length;
  try { localStorage.setItem('aerosense_alerts_seen_sig', 'c' + active); } catch (e) {}
  qsa('.alerts-badge').forEach(el => {
    el.textContent = '0';
    el.style.display = 'none';
  });
}

// ---- Notifications ----
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('This browser does not support notifications.');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showTestNotification();
  } else {
    alert('Notifications are blocked. Enable them in your browser site settings to receive alerts.');
  }
}

function showTestNotification() {
  if (Notification.permission !== 'granted') return;
  new Notification('AeroSense Alerts', {
    body: 'You will now receive weather and AQI alerts.',
    icon: '../assets/icon-192.png',
    badge: '../assets/icon-192.png',
  });
}

// ---- Event Listeners ----
function setupEventListeners() {
  // Tab filter buttons
  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.dataset.filter;
      renderAlerts();
    });
  });

  // Enable notifications button
  const notifBtn = el('enable-notifications');
  if (notifBtn) {
    notifBtn.addEventListener('click', requestNotificationPermission);
  }

  // View All Alerts
  const viewAllBtn = el('view-all-alerts');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      state.activeFilter = 'all';
      qsa('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
      renderAlerts();
    });
  }
}

// Safe boot — ES modules are deferred, DOMContentLoaded may already have fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
