/* ============================================================
   AeroSense – storage.js
   LocalStorage abstraction with JSON serialization
   ============================================================ */

const Storage = (() => {
  const PREFIX = 'aerosense_';

  /** Read a value from localStorage */
  const get = (key, fallback = null) => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  /** Write a value to localStorage */
  const set = (key, value) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Storage] set failed:', e);
      return false;
    }
  };

  /** Remove a key */
  const remove = (key) => {
    localStorage.removeItem(PREFIX + key);
  };

  /** Clear all AeroSense keys */
  const clear = () => {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  };

  // ---- Settings helpers ----
  const getSettings = () => get('settings', {
    theme: 'dark',
    units: {
      temperature: 'C',
      wind: 'kmh',
      pressure: 'hPa',
      distance: 'km',
    },
    fullscreenWeather: false,
    dynamicAnimations: true,
    updateFrequency: 10,
    language: 'en',
    alertPrefs: {
      rain: true,
      aqi: true,
      uv: true,
      wind: false,
      severe: true,
    },
  });

  const saveSettings = (settings) => set('settings', settings);

  // ---- Weather cache ----
  const cacheWeather = (data) => set('weather_cache', { data, ts: Date.now() });
  const getCachedWeather = () => get('weather_cache', null);

  const cacheAQI = (data) => set('aqi_cache', { data, ts: Date.now() });
  const getCachedAQI = () => get('aqi_cache', null);

  const cacheLocation = (loc) => set('location', loc);
  const getCachedLocation = () => get('location', null);

  // ---- History (for Today vs Normal) ----
  const appendHistory = (entry) => {
    const history = get('weather_history', []);
    history.push({ ...entry, date: new Date().toDateString() });
    // Keep last 90 days
    const trimmed = history.slice(-90);
    set('weather_history', trimmed);
  };
  const getHistory = () => get('weather_history', []);

  // ---- Saved places ----
  const getSavedPlaces = () => get('saved_places', [
    { name: 'Mangalore', state: 'KA', temp: 30, condition: '⛅', lat: 12.87, lon: 74.84 },
    { name: 'Mumbai', state: 'MH', temp: 28, condition: '🌤', lat: 19.07, lon: 72.87 },
    { name: 'Delhi', state: 'DL', temp: 33, condition: '☀️', lat: 28.63, lon: 77.21 },
  ]);
  const savePlaces = (places) => set('saved_places', places);

  // ---- Install prompt dismissed ----
  const isInstallDismissed = () => get('install_dismissed', false);
  const dismissInstall = () => set('install_dismissed', true);

  return {
    get, set, remove, clear,
    getSettings, saveSettings,
    cacheWeather, getCachedWeather,
    cacheAQI, getCachedAQI,
    cacheLocation, getCachedLocation,
    appendHistory, getHistory,
    getSavedPlaces, savePlaces,
    isInstallDismissed, dismissInstall,
  };
})();

export default Storage;
