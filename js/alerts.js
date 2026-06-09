/* ============================================================
   AeroSense – alerts.js
   Alerts page: active/upcoming alerts, notification toggles,
   detail modal, badge management.
   ============================================================ */

import Storage from './storage.js';
import { getAQILabel, getUVLabel, el, qs, qsa } from './utils.js';
import { checkAndFireAlertNotifications } from './notify.js';

let state = {
  settings:     null,
  alertPrefs:   null,
  activeFilter: 'all',
  weather:      null,
  aqi:          null,
  alerts:       [],   // cache of buildAlerts() result for modal lookup
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
  state.aqi     = ca?.data;

  renderAll();
  setupEventListeners();
  updateNotifToggle();        // reflect current notification state on load

  // Re-check active conditions against the user's prefs/permission and
  // fire any notifications that are due — covers the case where alert
  // conditions changed since the last Home-page refresh.
  checkAndFireAlertNotifications(state.weather, state.aqi);
}

function applyTheme(theme) {
  const isDark = theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// ── Alert Data ────────────────────────────────────────────────────
function buildAlerts() {
  const w = state.weather;
  const a = state.aqi;
  // Use ?? with safe non-extreme defaults so the count matches nav.js exactly.
  // ?? 3 = UV safe (< 7, not active); ?? 50 = AQI good (<= 100, not active).
  const aqiVal     = a?.current?.aqi      ?? 50;
  const uvVal      = w?.current?.uvIndex  ?? 3;
  const windVal    = w?.current?.windSpeed ?? 14;
  const precipProb = w?.daily?.[0]?.precipProb || 70;

  const allAlerts = [];

  // ── Active: Rain
  if (precipProb >= 60 || state.alertPrefs.rain) {
    allAlerts.push({
      id: 'rain-active', type: 'weather', category: 'rain',
      title: 'Heavy Rain Alert',
      desc:  'Heavy rain expected in your area with possible localised flooding.',
      icon: '🌧', iconBg: 'rgba(59,130,246,.15)', borderColor: '#3b82f6',
      status: 'active', badgeColor: '#ef4444',
      time: 'Today, 4:30 PM – 7:30 PM',
      area: 'Bengaluru, Bengaluru Rural',
      severity: 'active',
    });
  }

  // ── Active: Wind
  if (windVal >= 30 || true) {
    allAlerts.push({
      id: 'wind-active', type: 'wind', category: 'wind',
      title: 'Strong Wind Alert',
      desc:  `Strong winds with gusts up to ${Math.max(40, Math.round(windVal))} km/h expected.`,
      icon: '💨', iconBg: 'rgba(249,115,22,.15)', borderColor: '#f97316',
      status: 'active', badgeColor: '#f97316',
      time: 'Today, 12:00 PM – 8:00 PM',
      area: 'Bengaluru',
      severity: 'wind',
    });
  }

  // ── Upcoming: Moderate Rain
  allAlerts.push({
    id: 'rain-upcoming', type: 'weather', category: 'rain',
    title: 'Moderate Rain Expected',
    desc:  'Rain likely to start in your area from early morning.',
    icon: '🌦', iconBg: 'rgba(59,130,246,.1)', borderColor: '#3b82f6',
    status: 'upcoming', badgeColor: '#3b82f6',
    time: 'Tomorrow, 9:00 AM – 12:00 PM',
    area: '',
    severity: 'upcoming',
  });

  // ── UV — always present; high UV is active
  {
    const high = uvVal >= 7;
    allAlerts.push({
      id: high ? 'uv-active' : 'uv-info',
      type: 'uv', category: 'uv',
      title: high ? 'High UV Index' : 'UV Index Normal',
      desc:  high
        ? `UV index is ${Math.round(uvVal)} — limit direct sun exposure, especially midday.`
        : `UV index is ${Math.round(uvVal)} — low risk outdoors today.`,
      icon: '☀️', iconBg: 'rgba(234,179,8,.15)', borderColor: '#eab308',
      status: high ? 'active' : 'upcoming', badgeColor: '#eab308',
      time:   high ? 'Today, 11:00 AM – 3:00 PM' : 'Tomorrow, 11:00 AM – 3:00 PM',
      area: '',
      severity: 'uv',
    });
  }

  // ── AQI — always present; poor AQI is active
  {
    const poor = aqiVal > 100;
    allAlerts.push({
      id: poor ? 'aqi-active' : 'aqi-info',
      type: 'aqi', category: 'aqi',
      title: poor ? 'Poor Air Quality' : 'Air Quality Update',
      desc:  poor
        ? `AQI is ${aqiVal} — air may be unhealthy. Limit outdoor activity.`
        : `AQI is ${aqiVal} — air quality is acceptable today.`,
      icon: '🌫', iconBg: poor ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.12)',
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

// ── Render ────────────────────────────────────────────────────────
function renderAll() {
  renderAlerts();
  renderAlertSettings();
  renderLocationSummary();
  updateBadgeCount();
}

function renderAlerts() {
  const allAlerts = buildAlerts();
  state.alerts    = allAlerts;            // keep for modal lookup

  const filter   = state.activeFilter;
  const filtered = filter === 'all'
    ? allAlerts
    : allAlerts.filter(a => a.category === filter || a.type === filter);

  const active   = filtered.filter(a => a.status === 'active');
  const upcoming = filtered.filter(a => a.status === 'upcoming');

  const activeContainer   = el('active-alerts');
  const upcomingContainer = el('upcoming-alerts');
  if (!activeContainer || !upcomingContainer) return;

  activeContainer.innerHTML   = active.length
    ? active.map(a => buildAlertCard(a)).join('')
    : `<div style="padding:var(--space-xl);opacity:.5;text-align:center">No active alerts</div>`;

  upcomingContainer.innerHTML = upcoming.length
    ? upcoming.map(a => buildAlertCard(a)).join('')
    : `<div style="padding:var(--space-xl);opacity:.5;text-align:center">No upcoming alerts</div>`;

  // Wire interactions after DOM update
  requestAnimationFrame(wireAlertCards);
}

// ── Per-severity detail for the modal ────────────────────────────
const ALERT_ADVICE = {
  active:   'Stay indoors if possible. Monitor local news for updates.',
  wind:     'Secure loose outdoor objects. Avoid unnecessary travel.',
  upcoming: 'Prepare in advance. Check back for live updates.',
  uv:       'Wear sunscreen SPF 50+, hat, and UV-blocking sunglasses.',
  aqi:      'Limit outdoor activity. Keep windows closed indoors.',
};

const ALERT_DETAIL_ACTIONS = {
  active:   [
    'Stay indoors when possible',
    'Avoid driving on waterlogged roads',
    'Keep emergency kit and torch ready',
    'Monitor local emergency broadcasts',
  ],
  wind:     [
    'Secure or bring in outdoor furniture',
    'Avoid open fields and tall trees',
    'Maintain extra vehicle following distance',
    'Inspect roof, windows, and door seals',
  ],
  upcoming: [
    'Check forecast before going out',
    'Carry an umbrella or rain jacket',
    'Allow extra commute time',
    'Back up outdoor plans with alternatives',
  ],
  uv:       [
    'Apply SPF 50+ sunscreen every 2 hours',
    'Wear UV-protective sunglasses and a hat',
    'Seek shade between 11 AM and 3 PM',
    'Stay hydrated and take cool breaks',
  ],
  aqi:      [
    'Limit prolonged outdoor exertion',
    'Wear an N95 / FFP2 mask outdoors',
    'Keep windows and doors closed',
    'Run an air purifier if available',
  ],
};

function buildAlertCard(alert) {
  const badgeLabel = alert.status === 'active' ? 'Active' : 'Upcoming';
  const advice     = ALERT_ADVICE[alert.severity] || ALERT_ADVICE[alert.status] || '';
  return `
    <div class="alert-card ${alert.severity}" data-id="${alert.id}"
         style="cursor:pointer" role="button" tabindex="0" aria-expanded="false">
      <div class="ac-main-row">
        <div class="ac-icon-wrap" style="background:${alert.iconBg}">${alert.icon}</div>
        <div class="ac-body">
          <div class="ac-title">${alert.title}</div>
          <div class="ac-desc">${alert.desc}</div>
          <div class="ac-meta">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
              </svg>
              ${alert.time}
            </span>
            ${alert.area ? `<span>📍 ${alert.area}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
          <div class="ac-badge" style="color:${alert.badgeColor};background:${alert.iconBg}">${badgeLabel}</div>
          <svg class="ac-chevron" width="16" height="16" fill="none" stroke="currentColor"
               stroke-width="2" viewBox="0 0 24 24"
               style="opacity:.5;transition:transform .2s"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>
      <!-- Expanded detail panel -->
      <div class="ac-detail" style="display:none;padding-top:12px;border-top:1px solid var(--color-border);margin-top:12px">
        ${advice ? `<div style="font-size:var(--text-sm);opacity:.8;margin-bottom:10px;display:flex;align-items:flex-start;gap:6px"><span style="flex-shrink:0;margin-top:1px">💡</span> ${advice}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="ac-view-btn"
                  style="font-size:var(--text-xs);font-weight:600;color:var(--color-brand);
                         padding:5px 14px;border-radius:99px;border:1px solid var(--color-brand);
                         background:none;cursor:pointer">
            View Details →
          </button>
          <button class="ac-dismiss-btn"
                  style="font-size:var(--text-xs);font-weight:600;color:var(--text-secondary);
                         padding:5px 12px;border-radius:99px;border:1px solid var(--color-border);
                         background:none;cursor:pointer">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  `;
}

function wireAlertCards() {
  qsa('.alert-card[data-id]').forEach(card => {
    if (card._wired) return;
    card._wired = true;

    // ── Accordion toggle (click on whole card) ────────────────
    const toggle = () => {
      const detail  = card.querySelector('.ac-detail');
      const chevron = card.querySelector('.ac-chevron');
      if (!detail) return;
      const isOpen  = detail.style.display !== 'none';
      detail.style.display = isOpen ? 'none' : 'block';
      card.setAttribute('aria-expanded', String(!isOpen));
      if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    // ── View Details → opens modal ───────────────────────────
    const viewBtn = card.querySelector('.ac-view-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', e => {
        e.stopPropagation();          // don't toggle accordion
        const alertId   = card.dataset.id;
        const alertData = state.alerts.find(a => a.id === alertId);
        if (alertData) showAlertModal(alertData);
      });
    }

    // ── Dismiss → fade + remove ──────────────────────────────
    const dismissBtn = card.querySelector('.ac-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', e => {
        e.stopPropagation();
        card.style.transition = 'opacity .3s, transform .3s';
        card.style.opacity    = '0';
        card.style.transform  = 'translateX(8px)';
        setTimeout(() => card.remove(), 300);
      });
    }
  });
}

// ── Alert Detail Modal ────────────────────────────────────────────
function showAlertModal(alert) {
  // Remove any stale modal
  const stale = document.getElementById('aerosense-alert-modal');
  if (stale) stale.remove();

  const advice   = ALERT_ADVICE[alert.severity] || ALERT_ADVICE[alert.status] || '';
  const actions  = ALERT_DETAIL_ACTIONS[alert.severity] || ALERT_DETAIL_ACTIONS[alert.status] || [];
  const badgeTxt = alert.status === 'active' ? 'Active Alert' : 'Upcoming';

  // Current conditions block (optional — only when data available)
  let condHTML = '';
  const w = state.weather;
  const a = state.aqi;
  if (w?.current && a?.current) {
    const temp  = Math.round(w.current.temp);
    const wind  = Math.round(w.current.windSpeed);
    const aqi   = Math.round(a.current.aqi);
    condHTML = `
      <div style="margin-top:var(--space-xl)">
        <div style="font-size:var(--text-xs);font-weight:700;opacity:.5;text-transform:uppercase;
                    letter-spacing:.06em;margin-bottom:10px">Current Conditions</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${condChip('🌡', temp + '°C',        'Temperature')}
          ${condChip('💨', wind + ' km/h',     'Wind')}
          ${condChip('🌿', 'AQI ' + aqi,       'Air Quality')}
        </div>
      </div>`;
  }

  const actionsHTML = actions.length
    ? `<div style="margin:var(--space-xl) 0">
        <div style="font-size:var(--text-xs);font-weight:700;opacity:.5;text-transform:uppercase;
                    letter-spacing:.06em;margin-bottom:10px">Recommended Actions</div>
        <ul class="alert-modal-actions">
          ${actions.map(ac => `<li>${ac}</li>`).join('')}
        </ul>
      </div>`
    : '';

  const areaHTML = alert.area
    ? `<div style="font-size:var(--text-sm);opacity:.6;margin-top:4px;display:flex;align-items:center;gap:5px">📍 ${alert.area}</div>`
    : '';

  const overlay = document.createElement('div');
  overlay.id        = 'aerosense-alert-modal';
  overlay.className = 'alert-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', alert.title);
  overlay.innerHTML = `
    <div class="alert-modal-box" role="document">
      <button class="alert-modal-close" aria-label="Close">✕</button>

      <div class="alert-modal-hdr" style="background:${alert.iconBg}">
        <div style="margin-bottom:var(--space-sm)">${alert.icon}</div>
        <div style="font-weight:800;font-size:var(--text-xl);margin-bottom:6px">${alert.title}</div>
        <span class="ac-badge" style="color:${alert.badgeColor};background:rgba(0,0,0,.15);
              display:inline-flex;align-items:center;gap:4px">
          <span style="width:6px;height:6px;border-radius:50%;background:${alert.badgeColor};
                display:inline-block"></span>
          ${badgeTxt}
        </span>
      </div>

      <div class="alert-modal-body">
        <p style="font-size:var(--text-base);line-height:1.65;opacity:.85;margin-bottom:var(--space-md)">
          ${alert.desc}
        </p>

        <div style="font-size:var(--text-sm);opacity:.6;display:flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8"  y1="2" x2="8"  y2="6"/>
            <line x1="3"  y1="10" x2="21" y2="10"/>
          </svg>
          ${alert.time}
        </div>
        ${areaHTML}

        ${advice ? `
          <div style="margin-top:var(--space-xl);background:rgba(59,130,246,.1);
                      border-radius:var(--radius-lg);padding:var(--space-md) var(--space-lg);
                      font-size:var(--text-sm);line-height:1.5">
            💡 ${advice}
          </div>
        ` : ''}

        ${actionsHTML}
        ${condHTML}

        <div style="margin-top:var(--space-2xl);font-size:var(--text-xs);opacity:.35;text-align:right">
          Source: Open-Meteo · AeroSense
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in (next tick so CSS transition fires)
  requestAnimationFrame(() => overlay.classList.add('open'));

  // Focus the close button for keyboard users
  const closeBtn = overlay.querySelector('.alert-modal-close');
  setTimeout(() => closeBtn && closeBtn.focus(), 80);

  // Close handlers
  if (closeBtn) closeBtn.addEventListener('click', closeAlertModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAlertModal(); });
  document.addEventListener('keydown', _handleModalKey);
}

function condChip(icon, value, label) {
  return `<div style="background:var(--bg-input);border-radius:var(--radius-md);
                       padding:10px 6px;text-align:center">
    <div style="margin-bottom:3px;display:flex;justify-content:center">${icon}</div>
    <div style="font-size:var(--text-sm);font-weight:700">${value}</div>
    <div style="font-size:10px;opacity:.5;margin-top:1px">${label}</div>
  </div>`;
}

function closeAlertModal() {
  const overlay = document.getElementById('aerosense-alert-modal');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.removeEventListener('keydown', _handleModalKey);
  setTimeout(() => overlay.remove(), 300);
}

function _handleModalKey(e) {
  if (e.key === 'Escape') closeAlertModal();
}

// ── Alert Settings Panel ──────────────────────────────────────────
function renderAlertSettings() {
  const prefs = state.alertPrefs;
  const settingsList = [
    { key: 'rain',   icon: '💧', label: 'Rain Alerts',           desc: 'Get notified about rain in your area',  iconBg: 'rgba(59,130,246,.15)' },
    { key: 'aqi',    icon: '🌿', label: 'Air Quality Alerts',    desc: 'Get notified about poor air quality',   iconBg: 'rgba(34,197,94,.15)'  },
    { key: 'uv',     icon: '☀️', label: 'UV Index Alerts',       desc: 'Get notified about high UV index',      iconBg: 'rgba(234,179,8,.15)'  },
    { key: 'wind',   icon: '💨', label: 'Wind Alerts',           desc: 'Get notified about strong winds',       iconBg: 'rgba(139,92,246,.15)' },
    { key: 'severe', icon: '⛈', label: 'Severe Weather Alerts', desc: 'Get notified about severe weather',     iconBg: 'rgba(239,68,68,.15)'  },
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

  // Persist preference changes
  container.querySelectorAll('input[type=checkbox]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.pref;
      state.alertPrefs[key] = input.checked;
      const settings = Storage.getSettings();
      settings.alertPrefs = state.alertPrefs;
      Storage.saveSettings(settings);
      state.settings = settings;
      renderAlerts();

      // Auto-request permission when user first enables any alert type
      if (input.checked && 'Notification' in window && Notification.permission === 'default') {
        requestNotificationPermission();
      }
    });
  });
}

function renderLocationSummary() {
  const w = state.weather;
  const a = state.aqi;
  if (!w) return;

  const loc     = Storage.getCachedLocation();
  const locName = loc?.name || 'Your Location';
  const { current } = w;
  const container = el('alert-location-summary');
  if (!container) return;

  const aqiInfo = getAQILabel(a?.current?.aqi || 78);

  container.innerHTML = `
    <div style="font-size:var(--text-xs);opacity:.6;margin-bottom:4px">Active Location</div>
    <div style="font-weight:700;margin-bottom:8px">${locName}</div>
    <div style="font-size:var(--text-2xl);font-weight:800">${current.temp}°C</div>
    <div style="font-size:var(--text-sm);opacity:.7;margin-bottom:8px">Current Conditions</div>
    <div style="font-size:var(--text-lg);font-weight:700;color:${aqiInfo.color}">AQI ${a?.current?.aqi || 78}</div>
    <div style="font-size:var(--text-sm);color:${aqiInfo.color}">${aqiInfo.label}</div>
  `;
}

// ── Badge management ──────────────────────────────────────────────
// Called when user lands on Alerts page — marks current alerts as seen,
// hides the red badge on ALL badge elements (sidebar, topbar, bottom nav).
function updateBadgeCount() {
  const active = buildAlerts().filter(a => a.status === 'active').length;
  try {
    // Store the exact count the user is seeing now.
    // nav.js reads this and hides the badge when seenCount >= currentCount.
    localStorage.setItem('aerosense_alerts_seen', String(active));
    // Remove the old string-based key so there's no stale comparison.
    localStorage.removeItem('aerosense_alerts_seen_sig');
  } catch (e) {}

  // Immediately hide every badge on this page.
  qsa('.alerts-badge, .btn-badge, .bn-badge').forEach(badge => {
    badge.textContent = '0';
    badge.style.display = 'none';
  });
}

// ── Notification master preference (in-app on/off, separate from OS permission) ──
function getNotifMasterPref() {
  try { return JSON.parse(localStorage.getItem('aerosense_notif_master') ?? 'true'); }
  catch { return true; }
}
function setNotifMasterPref(val) {
  try { localStorage.setItem('aerosense_notif_master', JSON.stringify(!!val)); } catch {}
}

// Update toggle button + topbar bell to reflect current permission + pref state
function updateNotifToggle() {
  const btn   = el('notif-toggle');
  const label = btn?.querySelector('.ntb-label');
  const banner = el('notif-status-banner');
  const topBell = qs('.mt-btn.notif-btn');

  if (!('Notification' in window)) {
    if (btn)    { btn.className = 'notif-toggle-btn ntb-blocked'; btn.setAttribute('aria-pressed','false'); }
    if (label)  { label.textContent = 'Not Supported'; }
    if (banner) { banner.className = 'notif-status-banner notif-denied'; banner.style.display = ''; banner.textContent = '🔕 Push notifications are not supported in this browser.'; }
    return;
  }

  const perm     = Notification.permission;
  const masterOn = getNotifMasterPref();
  const isOn     = perm === 'granted' && masterOn;

  // Toggle button state
  if (btn) {
    btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    if (perm === 'denied') {
      btn.className = 'notif-toggle-btn ntb-blocked';
    } else if (isOn) {
      btn.className = 'notif-toggle-btn ntb-on';
    } else {
      btn.className = 'notif-toggle-btn';
    }
  }
  if (label) {
    label.textContent = perm === 'denied'           ? 'Blocked — see Site Settings'
                      : (perm === 'granted' && isOn) ? 'Notifications On'
                      : (perm === 'granted' && !isOn)? 'Notifications Off'
                      :                                'Enable Notifications';
  }

  // Status banner — only shown when blocked (can't fix via toggle)
  if (banner) {
    if (perm === 'denied') {
      banner.className = 'notif-status-banner notif-denied';
      banner.style.display = '';
      banner.textContent = '🔕 Notifications blocked. Open browser Site Settings → Notifications to allow this site.';
    } else {
      banner.style.display = 'none';
    }
  }

  // Topbar bell icon colour
  if (topBell) {
    topBell.classList.toggle('ntb-on', isOn);
    topBell.setAttribute('aria-label', isOn ? 'Notifications on' : 'Toggle notifications');
  }
}

// ── Notifications ─────────────────────────────────────────────────
async function handleNotifToggle() {
  if (!('Notification' in window)) {
    showToast('Push notifications are not supported in this browser.', 'warn');
    return;
  }

  // iOS detection — notifications only work in installed PWA (iOS 16.4+)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;

  if (isIOS && !isStandalone) {
    showToast('To receive notifications on iOS:\nTap Share → "Add to Home Screen", then re-open the app.', 'info');
    return;
  }

  const perm = Notification.permission;

  if (perm === 'denied') {
    showToast('Notifications are blocked. Go to browser Site Settings → Notifications and allow this site.', 'error');
    updateNotifToggle();
    return;
  }

  if (perm === 'granted') {
    // Toggle the in-app master preference on/off
    const wasOn = getNotifMasterPref();
    setNotifMasterPref(!wasOn);
    updateNotifToggle();
    if (!wasOn) {
      showToast('Notifications enabled! 🔔', 'success');
      showTestNotification();
    } else {
      showToast('Notifications paused. Toggle again to re-enable.', 'info');
    }
    return;
  }

  // permission === 'default' — prompt the user
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setNotifMasterPref(true);
      updateNotifToggle();
      showTestNotification();
      showToast('Notifications enabled! You\'ll be alerted about weather changes. 🔔', 'success');
    } else {
      updateNotifToggle();
      showToast(result === 'denied'
        ? 'Notifications denied. Enable in browser Site Settings.'
        : 'Notification permission not granted.', 'warn');
    }
  } catch {
    showToast('Could not request notification permission. Try enabling from browser settings.', 'error');
  }
}

async function showTestNotification() {
  if (Notification.permission !== 'granted') return;
  const opts = {
    body:  'You\'ll receive alerts for rain, UV, air quality, and wind. Stay safe!',
    icon:  '../assets/icon-192.png',
    badge: '../assets/icon-192.png',
    tag:   'aerosense-welcome',
  };
  // Prefer service worker notification — works in background on Android Chrome
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('AeroSense Alerts Enabled 🔔', opts);
      return;
    } catch (_) { /* fall through to direct notification */ }
  }
  const n = new Notification('AeroSense Alerts Enabled 🔔', opts);
  setTimeout(() => n.close(), 6000);
}

// Update the notification permission status banner below the page header
function updateNotifStatus() {
  const banner = el('notif-status-banner');
  if (!banner) return;

  if (!('Notification' in window)) {
    banner.className   = 'notif-status-banner notif-denied';
    banner.style.display = '';
    banner.innerHTML   = `🔕 Push notifications are not supported in this browser.`;
    return;
  }

  const perm = Notification.permission;
  if (perm === 'granted') {
    banner.className   = 'notif-status-banner notif-granted';
    banner.style.display = '';
    banner.innerHTML   = `🔔 Notifications are enabled — you'll be alerted about weather changes.`;
    // Visually update the enable-buttons to reflect granted state
    qsa('.notif-btn').forEach(btn => {
      btn.textContent         = '✓ Notifications On';
      btn.style.background    = 'rgba(34,197,94,.12)';
      btn.style.color         = '#22c55e';
      btn.style.pointerEvents = 'none';
      btn.style.opacity       = '.8';
    });
  } else if (perm === 'denied') {
    banner.className   = 'notif-status-banner notif-denied';
    banner.style.display = '';
    banner.innerHTML   = `🔕 Notifications blocked. Open browser Site Settings to allow notifications.`;
  } else {
    // Default — hide the banner; the button in the header handles this case
    banner.style.display = 'none';
  }
}

// ── Toast helper ──────────────────────────────────────────────────
function showToast(msg, type) {
  const old = document.getElementById('aerosense-toast');
  if (old) old.remove();

  const colorMap = { success: '#22c55e', warn: '#f59e0b', error: '#ef4444', info: '#3b82f6' };
  const color    = colorMap[type] || colorMap.info;

  const toast = document.createElement('div');
  toast.id = 'aerosense-toast';
  toast.style.cssText = [
    'position:fixed',
    'bottom:calc(70px + env(safe-area-inset-bottom, 0px) + 12px)',
    'left:50%',
    'transform:translateX(-50%) translateY(0)',
    'background:var(--bg-card)',
    'color:var(--text-primary)',
    'padding:12px 20px',
    'border-radius:var(--radius-xl)',
    'border-left:4px solid ' + color,
    'font-size:var(--text-sm)',
    'font-weight:600',
    'max-width:88vw',
    'text-align:left',
    'white-space:pre-line',
    'line-height:1.5',
    'box-shadow:0 4px 24px rgba(0,0,0,.35)',
    'z-index:9999',
    'opacity:1',
    'transition:opacity .3s',
  ].join(';');
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 320);
  }, 5000);
}

// ── Event listeners ───────────────────────────────────────────────
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

  // Notification toggle — main toggle button + mobile topbar bell
  const notifToggle = el('notif-toggle');
  if (notifToggle) notifToggle.addEventListener('click', handleNotifToggle);
  const topBell = qs('.mt-btn.notif-btn');
  if (topBell) topBell.addEventListener('click', handleNotifToggle);

  // "View All Alerts" button
  const viewAllBtn = el('view-all-alerts');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      state.activeFilter = 'all';
      qsa('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
      renderAlerts();
    });
  }
}

// ── Safe boot ─────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
