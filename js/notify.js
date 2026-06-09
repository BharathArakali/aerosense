/* ============================================================
   AeroSense – notify.js
   Shared "real" alert notifications.

   The app has no backend/push server, so notifications are fired
   client-side: every time fresh weather/AQI data is loaded (on the
   Home page refresh cycle, and whenever the Alerts page initialises)
   we evaluate the same active-alert conditions used by alerts.js and
   fire a local notification for any condition that just BECAME active
   and that the user has enabled in their alert preferences.

   State (which alerts we've already notified about) is kept in
   localStorage so we don't repeat the same notification every refresh,
   but DO notify again once a condition clears and re-triggers later.
   ============================================================ */

import Storage from './storage.js';

const SEEN_KEY = 'aerosense_notified_alerts';

/**
 * Evaluate current weather/AQI against alert thresholds (mirrors the
 * logic in alerts.js#buildAlerts) and fire local notifications for any
 * newly-active condition the user has enabled.
 *
 * Safe to call often — it no-ops unless permission is granted and a
 * condition has freshly turned active.
 *
 * @param {object|null} weather  Cached/fresh weather payload (state.weather shape)
 * @param {object|null} aqi      Cached/fresh AQI payload (state.aqi shape)
 */
export async function checkAndFireAlertNotifications(weather, aqi) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Respect the in-app master toggle (user can pause notifications without revoking OS permission)
    try { if (!JSON.parse(localStorage.getItem('aerosense_notif_master') ?? 'true')) return; } catch {}

    const settings   = Storage.getSettings();
    const prefs      = settings.alertPrefs || { rain: true, aqi: true, uv: true, wind: false, severe: true };

    const aqiVal     = aqi?.current?.aqi       ?? 50;
    const uvVal      = weather?.current?.uvIndex   ?? 3;
    const windVal    = weather?.current?.windSpeed ?? 14;
    const precipProb = weather?.daily?.[0]?.precipProb ?? 0;

    // id ↔ same ids alerts.js uses for its "active" cards, so tapping the
    // notification and landing on Alerts shows the matching card.
    const candidates = [
      {
        id: 'rain-active', enabled: prefs.rain || prefs.severe, active: precipProb >= 60,
        title: '🌧 Heavy Rain Alert',
        body:  'Heavy rain expected in your area with possible localised flooding.',
      },
      {
        id: 'wind-active', enabled: prefs.wind || prefs.severe, active: windVal >= 30,
        title: '💨 Strong Wind Alert',
        body:  `Strong winds with gusts up to ${Math.max(40, Math.round(windVal))} km/h expected.`,
      },
      {
        id: 'uv-active', enabled: prefs.uv, active: uvVal >= 7,
        title: '☀️ High UV Index',
        body:  `UV index is ${Math.round(uvVal)} — limit direct sun exposure, especially midday.`,
      },
      {
        id: 'aqi-active', enabled: prefs.aqi, active: aqiVal > 100,
        title: '🌫 Poor Air Quality Alert',
        body:  `AQI is ${Math.round(aqiVal)} — air may be unhealthy. Limit outdoor activity.`,
      },
    ];

    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { seen = []; }

    const currentlyActive = candidates.filter(c => c.active).map(c => c.id);
    const toFire = candidates.filter(c => c.active && c.enabled && !seen.includes(c.id));

    for (const alert of toFire) {
      await fireNotification(alert.title, alert.body, alert.id);
    }

    // Persist exactly the set of conditions active right now — once a
    // condition clears it drops out of `seen`, so it will notify again
    // if it re-triggers later (matches "real alert" expectations).
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(currentlyActive)); } catch {}
  } catch (err) {
    console.warn('[AeroSense] Alert notification check failed:', err);
  }
}

async function fireNotification(title, body, tag) {
  // Prefer the service-worker route — this is what allows the notification
  // to show even when AeroSense isn't the focused tab (Android Chrome / PWA).
  // Icon/url paths must be resolved against the SW's *scope*, not the
  // calling page's location (which differs between index.html and
  // pages/alerts.html), otherwise the icon 404s from one of the two.
  if ('serviceWorker' in navigator) {
    try {
      const reg   = await navigator.serviceWorker.ready;
      const scope = reg.scope; // e.g. https://host/aerosense/
      await reg.showNotification(title, {
        body,
        icon:     new URL('assets/icon-192.png', scope).href,
        badge:    new URL('assets/icon-192.png', scope).href,
        tag,
        renotify: false,
        data:     { url: new URL('pages/alerts.html', scope).href },
      });
      return;
    } catch (_) { /* fall through to direct Notification */ }
  }

  // Direct Notification fallback — resolve against the app root, which
  // differs depending on whether we're called from index.html (root) or
  // pages/alerts.html (one level down).
  try {
    const root = appRootURL();
    const n = new Notification(title, {
      body,
      icon:  new URL('assets/icon-192.png', root).href,
      badge: new URL('assets/icon-192.png', root).href,
      tag,
    });
    setTimeout(() => n.close(), 8000);
  } catch (_) { /* Notification constructor unsupported in this context (e.g. iOS) */ }
}

// Resolve the AeroSense app root (the folder containing index.html),
// regardless of whether the current page lives at the root or in /pages/.
function appRootURL() {
  const path = location.pathname;
  const idx  = path.indexOf('/pages/');
  const rootPath = idx >= 0 ? path.slice(0, idx + 1) : path.slice(0, path.lastIndexOf('/') + 1);
  return new URL(rootPath, location.origin);
}

export default { checkAndFireAlertNotifications };
