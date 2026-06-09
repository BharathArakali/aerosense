/* ============================================================
   AeroSense – icons.js
   A small set of hand-built SVG icons in the Heroicons "outline"
   visual language (24x24 viewBox, 1.5px stroke, round caps/joins,
   currentColor) — the same convention already used by the inline
   <svg> markup in index.html (search icon, chevrons, etc).

   Heroicons itself (https://heroicons.com, MIT license) doesn't
   ship weather/activity-specific glyphs, so this module pairs a
   handful of real Heroicons paths (sun, cloud, bolt, bell,
   map-pin, eye, light-bulb, star, check-circle) with custom icons
   drawn to match the same stroke-based style for everything else
   (rain, snow, fog, wind, AQI "leaf", thermometer, activities…).

   Usage:
     import { iconHTML, iconFromEmoji } from './icons.js';
     el.innerHTML = iconHTML('sun', { size: 20 });
     el.innerHTML = iconFromEmoji(existingEmojiString, { size: 16 });
   ============================================================ */

// Each entry is the *inner* markup of an <svg> — paths only — so the
// wrapper can control size/stroke/color centrally.
export const ICONS = {
  // ---- Weather conditions ----
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.75v2M12 19.25v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2.75 12h2M19.25 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  'moon': '<path d="M21 12.79A9 9 0 1111.21 3a7.5 7.5 0 009.79 9.79z"/>',
  'cloud': '<path d="M6.5 18a4.5 4.5 0 01-.5-8.97A6 6 0 0117.5 9.5 4 4 0 0117 18H6.5z"/>',
  'cloud-sun': '<path d="M9 3.5v1.5M4.46 6.46l1.06 1.06M3.5 11h1.5M14.04 6.46l-1.06 1.06"/><circle cx="9" cy="9" r="2.5"/><path d="M8 19a4 4 0 01-.4-7.98A5.5 5.5 0 0117.9 12.6 3.5 3.5 0 0117.5 19H8z"/>',
  'cloud-moon': '<path d="M16.5 3a4.2 4.2 0 100 8.4 4.2 4.2 0 004-2.9 5.4 5.4 0 01-4-5.5z"/><path d="M8 19a4 4 0 01-.4-7.98A5.5 5.5 0 0117.9 12.6 3.5 3.5 0 0117.5 19H8z"/>',
  'fog': '<path d="M3.5 9h11M3.5 13h17M3.5 17h11M7.5 21h9"/>',
  'drizzle': '<path d="M6.5 14a4.5 4.5 0 01-.5-8.97A6 6 0 0117.5 5.5 4 4 0 0117 14H6.5z"/><path d="M9 17.5l-1 2M15 17.5l-1 2"/>',
  'rain': '<path d="M6.5 13a4.5 4.5 0 01-.5-8.97A6 6 0 0117.5 4.5 4 4 0 0117 13H6.5z"/><path d="M8 16l-1.5 3M12.5 16L11 19M17 16l-1.5 3"/>',
  'snow': '<path d="M6.5 12a4.5 4.5 0 01-.5-8.97A6 6 0 0117.5 3.5 4 4 0 0117 12H6.5z"/><path d="M8 17v.01M12 17v.01M16 17v.01M8 20v.01M12 20v.01M16 20v.01"/>',
  'snowflake': '<path d="M12 2.5v19M5.4 6.25l13.2 11.5M18.6 6.25L5.4 17.75"/><path d="M9 5l3 1.7L15 5M9 19l3-1.7L15 19M5.7 9.7L7.7 12l-2 2.3M18.3 9.7l-2 2.3 2 2.3"/>',
  'thunder': '<path d="M6.5 12.5a4.5 4.5 0 01-.5-8.97A6 6 0 0117.5 4 4 4 0 0117 12.5h-2.5"/><path d="M12.5 12l-3 5h2.5l-1 4.5 4-6h-2.5l1-3.5z"/>',

  // ---- Heroicons (outline, MIT) used as-is for general UI ----
  'bell': '<path d="M14.857 17.082a23.85 23.85 0 005.454-1.31A8.97 8.97 0 0118 9.75V9A6 6 0 006 9v.75a8.97 8.97 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.26 24.26 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>',
  'bell-slash': '<path d="M9.143 17.082a24.25 24.25 0 003.844.148m-3.844-.148a23.86 23.86 0 01-5.455-1.31 8.964 8.964 0 002.3-5.542m3.155 6.852a3 3 0 005.667 1.97M16.81 16.81A8.966 8.966 0 0018 9.75V9A6 6 0 006.53 5.78M3 3l18 18"/>',
  'map-pin': '<path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>',
  'light-bulb': '<path d="M12 18v-3.25m0 0a6 6 0 003-1.06m-3 1.06a6 6 0 01-3-1.06m6.5-5.69a6.5 6.5 0 10-9.5 5.69c.85.49 1.5 1.33 1.5 2.31V18h6v-2c0-.98.65-1.82 1.5-2.31a6.48 6.48 0 002-4.79z"/>',
  'star': '<path d="M11.48 3.5a.563.563 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557L2.041 10.386a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>',
  'check-circle': '<path d="M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
  'eye': '<path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',

  // ---- Custom (matching style) — environmental metrics ----
  'thermometer': '<path d="M10 13.94V5a2 2 0 114 0v8.94a4.5 4.5 0 11-4 0z"/><path d="M12 16.5v.01"/>',
  'wind': '<path d="M3 8h9.5a2.5 2.5 0 10-2.4-3.2M3 12.5h12.5a2.75 2.75 0 11-2.65 3.5M3 17h7a2.25 2.25 0 11-2.17 2.85"/>',
  'droplet': '<path d="M12 3.05s5.95 6.27 5.95 10.4A5.95 5.95 0 0112 19.4a5.95 5.95 0 01-5.95-5.95C6.05 9.32 12 3.05 12 3.05z"/>',
  'leaf': '<path d="M5 20c0-7.5 5-14 15-16-1.5 9.5-8 15-15 16z"/><path d="M9 16c2-3.2 5.2-6.4 9.5-8.4"/>',
  'health-mask': '<path d="M4 11c0-2.8 2-5 8-5s8 2.2 8 5-2.5 7-8 7-8-4.2-8-7z"/><path d="M4 11c-1 0-1.8.6-1.8 1.6S3 14 4 14M20 11c1 0 1.8.6 1.8 1.6S21 14 20 14"/><path d="M9 12.5c.6.6 1.4 1 3 1s2.4-.4 3-1"/>',

  // ---- Custom (matching style) — outdoor activities ----
  'act-walking': '<circle cx="13.2" cy="4.2" r="1.7"/><path d="M9.5 21l1.7-5.4 2 1.6 2.6.9M9.7 17.5l1.2-3.8 1.7-1.1 2.6 1.3-.8 2.6"/>',
  'act-running': '<circle cx="15.3" cy="4.2" r="1.7"/><path d="M8.5 21l2.2-4.4 1.8 1.3 2.7.4-1.7-3.4-2.6-.8-1.7 2.6-2.6.9"/>',
  'act-cycling': '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l3.5-7.5h3.5L16 14M9.5 9.5h3M9 17h6.5"/>',
  'act-sports': '<path d="M7 4.5h10v2.7a5 5 0 01-10 0V4.5z"/><path d="M7 5.5H4.3v.8A3 3 0 007 9.3M17 5.5h2.7v.8A3 3 0 0117 9.3M9.5 17.5h5M12 13v4.5M9 21h6"/>',
  'act-picnic': '<path d="M4.5 10h15l-1.4 8.6a2 2 0 01-2 1.65H7.9a2 2 0 01-2-1.65L4.5 10z"/><path d="M8 10a4 4 0 018 0M9.3 13.5l.7 5M14.7 13.5l-.7 5M12 13.5v5"/>',
};

/**
 * Build a complete inline <svg> for a given icon key.
 * @param {string} name   Key into ICONS.
 * @param {object} [opts]
 * @param {number} [opts.size=20]      Width & height in px.
 * @param {string} [opts.className]    Extra class(es) on the <svg>.
 * @param {number} [opts.strokeWidth=1.5]
 * @returns {string} Inline SVG markup, or '' if the key is unknown.
 */
export function iconHTML(name, opts = {}) {
  const body = ICONS[name];
  if (!body) return '';
  const size = opts.size || 20;
  const sw = opts.strokeWidth || 1.5;
  const cls = opts.className ? ` class="${opts.className}"` : '';
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
       + `stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" `
       + `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Legacy emoji glyph → icon key. Lets existing data tables (which still
// store emoji strings, e.g. WMO_CODES, alert configs, saved-place
// "condition" fields) render as crisp themed SVGs through one helper call,
// without having to restructure every data source that references them.
const EMOJI_TO_ICON = {
  '☀️': 'sun', '☀': 'sun',
  '🌤': 'cloud-sun', '🌤️': 'cloud-sun', '⛅': 'cloud-sun',
  '☁️': 'cloud', '☁': 'cloud', '🌥': 'cloud', '🌥️': 'cloud',
  '🌫': 'fog', '🌫️': 'fog',
  '🌦': 'drizzle', '🌦️': 'drizzle',
  '🌧': 'rain', '🌧️': 'rain',
  '🌨': 'snow', '🌨️': 'snow',
  '❄️': 'snowflake', '❄': 'snowflake',
  '⛈': 'thunder', '⛈️': 'thunder',
  '🌙': 'moon',
  '🌡️': 'thermometer', '🌡': 'thermometer',
  '💨': 'wind',
  '💧': 'droplet',
  '🌿': 'leaf',
  '👁️': 'eye', '👁': 'eye',
  '🔔': 'bell', '🔕': 'bell-slash',
  '📍': 'map-pin',
  '💡': 'light-bulb',
  '⭐': 'star',
  '🚶': 'act-walking', '🚶‍♂️': 'act-walking', '🚶‍♀️': 'act-walking',
  '🏃': 'act-running', '🏃‍♂️': 'act-running', '🏃‍♀️': 'act-running',
  '🚴': 'act-cycling', '🚴‍♂️': 'act-cycling', '🚴‍♀️': 'act-cycling',
  '⛹️': 'act-sports', '⛹': 'act-sports', '⛹️‍♂️': 'act-sports', '⛹️‍♀️': 'act-sports',
  '🧺': 'act-picnic',
};

/** Resolve an emoji glyph (with or without variation selector) to an icon key. */
export function emojiToIcon(glyph) {
  if (!glyph) return null;
  const trimmed = String(glyph).trim();
  return EMOJI_TO_ICON[trimmed]
      || EMOJI_TO_ICON[trimmed.replace(/️/g, '')]
      || null;
}

/**
 * Render an inline SVG for a legacy emoji glyph. Falls back to the glyph
 * itself (as plain text) when there's no mapping, so nothing ever
 * disappears if a new emoji is introduced before icons.js is updated.
 */
export function iconFromEmoji(glyph, opts = {}) {
  const key = emojiToIcon(glyph);
  return key ? iconHTML(key, opts) : (glyph || '');
}

export default { ICONS, iconHTML, emojiToIcon, iconFromEmoji };
