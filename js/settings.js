/* ============================================================
   AeroSense – settings.js
   Settings page: theme, units, preferences, privacy, about
   ============================================================ */

import Storage from './storage.js';
import { el, qs, qsa } from './utils.js';

let state = { settings: null };

function init() {
  state.settings = Storage.getSettings();
  applyTheme(state.settings.theme);
  renderAll();
  setupEventListeners();
}

function applyTheme(theme) {
  const isDark = theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function save() {
  Storage.saveSettings(state.settings);
}

function renderAll() {
  renderTheme();
  renderUnits();
  renderPreferences();
  renderAbout();
}

// ---- Theme ----
function renderTheme() {
  const { theme } = state.settings;
  qsa('.theme-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

// ---- Units ----
function renderUnits() {
  const { units } = state.settings;
  // Temperature
  qsa('[data-unit-group="temperature"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === units.temperature);
  });
  // Wind
  qsa('[data-unit-group="wind"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === units.wind);
  });
  // Pressure
  qsa('[data-unit-group="pressure"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === units.pressure);
  });
  // Distance
  qsa('[data-unit-group="distance"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === units.distance);
  });
}

// ---- Preferences ----
function renderPreferences() {
  const { fullscreenWeather, dynamicAnimations, updateFrequency, language } = state.settings;

  const fsToggle = el('pref-fullscreen');
  if (fsToggle) fsToggle.checked = fullscreenWeather;

  const animToggle = el('pref-animations');
  if (animToggle) animToggle.checked = dynamicAnimations;

  const freqEl = el('pref-frequency-val');
  if (freqEl) freqEl.textContent = `${updateFrequency} minutes`;

  const langEl = el('pref-language-val');
  if (langEl) langEl.textContent = language === 'en' ? 'English' : language;
}

// ---- About ----
function renderAbout() {
  const versionEl = el('app-version');
  if (versionEl) versionEl.textContent = '1.0.0';
}

// ---- Event Listeners ----
function setupEventListeners() {
  // Theme buttons
  qsa('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.settings.theme = btn.dataset.theme;
      save();
      applyTheme(state.settings.theme);
      renderTheme();
      // Also update app-wide
      document.documentElement.setAttribute('data-theme',
        btn.dataset.theme === 'dark' ? 'dark' : 'light'
      );
    });
  });

  // System theme button
  const sysBtn = el('theme-system-btn');
  if (sysBtn) {
    sysBtn.addEventListener('click', () => {
      state.settings.theme = 'system';
      save();
      applyTheme('system');
      renderTheme();
    });
  }

  // Unit buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-unit-group]');
    if (!btn) return;
    const group = btn.dataset.unitGroup;
    const unit = btn.dataset.unit;
    if (!group || !unit) return;
    state.settings.units[group] = unit;
    save();
    renderUnits();
  });

  // Fullscreen toggle
  const fsToggle = el('pref-fullscreen');
  if (fsToggle) {
    fsToggle.addEventListener('change', () => {
      state.settings.fullscreenWeather = fsToggle.checked;
      save();
    });
  }

  // Animations toggle
  const animToggle = el('pref-animations');
  if (animToggle) {
    animToggle.addEventListener('change', () => {
      state.settings.dynamicAnimations = animToggle.checked;
      save();
    });
  }

  // Update frequency click → cycle options
  const freqRow = el('pref-frequency-row');
  if (freqRow) {
    freqRow.addEventListener('click', () => {
      const opts = [5, 10, 15, 30, 60];
      const i = opts.indexOf(state.settings.updateFrequency);
      state.settings.updateFrequency = opts[(i + 1) % opts.length];
      save();
      renderPreferences();
    });
  }

  // Language click → cycle (demo)
  const langRow = el('pref-language-row');
  if (langRow) {
    langRow.addEventListener('click', () => {
      const opts = ['en', 'hi', 'te', 'kn', 'ta'];
      const labels = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు', kn: 'ಕನ್ನಡ', ta: 'தமிழ்' };
      const i = opts.indexOf(state.settings.language || 'en');
      state.settings.language = opts[(i + 1) % opts.length];
      save();
      const langEl = el('pref-language-val');
      if (langEl) langEl.textContent = labels[state.settings.language];
    });
  }

  // Default location row
  const locRow = el('pref-location-row');
  if (locRow) {
    locRow.addEventListener('click', () => {
      // Clear cached location to trigger geolocation on next load
      Storage.remove('location');
      alert('Location reset. Your location will be re-detected on the home page.');
    });
  }

  // Data Sources
  const dsRow = el('privacy-data-sources');
  if (dsRow) {
    dsRow.addEventListener('click', () => {
      window.open('https://open-meteo.com', '_blank');
    });
  }

  // Privacy Policy
  const ppRow = el('privacy-policy');
  if (ppRow) {
    ppRow.addEventListener('click', () => {
      alert('AeroSense collects no personal data. All data is fetched from open APIs and stored locally on your device only.');
    });
  }

  // Permissions
  const permRow = el('privacy-permissions');
  if (permRow) {
    permRow.addEventListener('click', async () => {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        alert(`Notification permission: ${perm}`);
      }
    });
  }

  // Rate AeroSense
  const rateRow = el('about-rate');
  if (rateRow) {
    rateRow.addEventListener('click', () => {
      alert('Thank you for using AeroSense! ⭐⭐⭐⭐⭐');
    });
  }

  // About AeroSense
  const aboutRow = el('about-aerosense');
  if (aboutRow) {
    aboutRow.addEventListener('click', () => {
      alert('AeroSense v1.0.0\nEnvironmental Intelligence Dashboard\nPowered by Open-Meteo & OpenStreetMap\n© 2024 AeroSense');
    });
  }

  // Clear data
  const clearBtn = el('clear-data-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all cached data and settings? This cannot be undone.')) {
        Storage.clear();
        location.reload();
      }
    });
  }
}

// Safe boot — ES modules are deferred, DOMContentLoaded may already have fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
