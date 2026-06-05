/* ============================================================
   AeroSense – nav.js  (v4 — portal dropdowns, single IIFE)
   Dropdowns use position:fixed + getBoundingClientRect so
   backdrop-filter / stacking-context issues can never clip them.
============================================================ */
(function () {
  'use strict';

  const isSubPage  = window.location.pathname.includes('/pages/');
  const assetBase  = isSubPage ? '../assets/' : 'assets/';
  const pagesBase  = isSubPage ? '' : 'pages/';
  const iconSrc    = assetBase + 'icon-192.png';
  const ALERTS_HREF   = pagesBase + 'alerts.html';
  const SETTINGS_HREF = pagesBase + 'settings.html';
  const HOME_HREF     = isSubPage ? '../index.html' : 'index.html';

  function getSettings() {
    try { return JSON.parse(localStorage.getItem('aerosense_settings') || '{}'); } catch(e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem('aerosense_settings', JSON.stringify(s)); } catch(e) {}
  }
  function getCached(key) {
    try { const r = localStorage.getItem('aerosense_' + key); return r ? JSON.parse(r) : null; } catch(e) { return null; }
  }
  function getLiveData() {
    const cw = getCached('weather_cache');
    const ca = getCached('aqi_cache');
    const loc = getCached('location');
    return { weather: cw?.data || null, aqi: ca?.data || null, location: loc || null, ts: cw?.ts || null };
  }
  function timeAgo(ts) {
    if (!ts) return '';
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return 'just now';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    return Math.floor(d / 3600) + 'h ago';
  }
  function calcScore(w, aqiVal) {
    if (!w) return 0;
    const a = aqiVal <= 50 ? 0 : aqiVal <= 100 ? 10 : aqiVal <= 150 ? 20 : aqiVal <= 200 ? 35 : 50;
    const t = Math.min(Math.abs(w.current.temp - 23) / 5, 3) * 5;
    const h = (w.current.humidity < 30 || w.current.humidity > 70) ? 10 : 0;
    const u = w.current.uvIndex <= 2 ? 0 : w.current.uvIndex <= 5 ? 3 : w.current.uvIndex <= 7 ? 8 : 15;
    const wi = w.current.windSpeed < 20 ? 0 : w.current.windSpeed < 40 ? 6 : 12;
    return Math.max(0, Math.min(100, Math.round(100 - a - t - h - u - wi)));
  }

  /* ── 1. PNG LOGO ─────────────────────────────────────────── */
  function injectPNGLogo() {
    document.querySelectorAll('.sidebar-logo').forEach(logo => {
      if (logo.querySelector('img.as-logo-img')) return;
      const svg = logo.querySelector('svg');
      const img = document.createElement('img');
      img.src = iconSrc; img.alt = 'AeroSense'; img.className = 'as-logo-img';
      img.width = 32; img.height = 32;
      img.style.cssText = 'border-radius:8px;object-fit:cover;flex-shrink:0;display:block;';
      img.onerror = () => { img.style.display = 'none'; };
      if (svg) svg.replaceWith(img); else logo.prepend(img);
    });
    document.querySelectorAll('.mobile-topbar .mt-logo').forEach(logoEl => {
      if (logoEl.querySelector('img.as-logo-img')) return;
      const img = document.createElement('img');
      img.src = iconSrc; img.alt = ''; img.className = 'as-logo-img';
      img.width = 26; img.height = 26;
      img.style.cssText = 'border-radius:6px;object-fit:cover;flex-shrink:0;vertical-align:middle;margin-right:6px;display:inline-block;';
      img.onerror = () => { img.style.display = 'none'; };
      logoEl.prepend(img);
    });
  }

  /* ── 2. THEME TOGGLE ─────────────────────────────────────── */
  function applyTheme(next) {
    document.documentElement.setAttribute('data-theme', next);
    const s = getSettings(); s.theme = next; saveSettings(s);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#0b0f1a' : '#eef2f8');
  }
  function setupThemeToggle() {
    document.querySelectorAll('.topbar-theme-btn').forEach(btn => {
      if (btn.dataset.navWired) return;
      btn.dataset.navWired = '1';
      btn.addEventListener('click', () => {
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    });
  }


  /* ── 3. PORTAL ENGINE ────────────────────────────────────── */
  var _portal = null;  // the currently-open dropdown DOM element

  function closeAll() {
    if (_portal) { _portal.remove(); _portal = null; }
  }

  /* Open a dropdown as a body-level portal, positioned below `anchorEl` */
  function openPortal(anchorEl, html, afterInsert) {
    closeAll();
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    const dd = tmp.firstElementChild;
    if (!dd) return;
    // Portal styles — fixed so no ancestor can clip it
    dd.style.cssText = 'position:fixed;z-index:99999;';
    document.body.appendChild(dd);
    // Position below the anchor button
    const rect = anchorEl.getBoundingClientRect();
    dd.style.top  = (rect.bottom + 8) + 'px';
    dd.style.right = (window.innerWidth - rect.right) + 'px';
    dd.style.left = 'auto';
    if (afterInsert) afterInsert(dd);
    // Animate in (transition picks up from CSS class)
    requestAnimationFrame(() => dd.classList.add('open'));
    _portal = dd;
  }

  /* ── 4. NOTIFICATION ITEMS ───────────────────────────────── */
  function buildNotifItems() {
    const { weather, aqi, location, ts } = getLiveData();
    const items = [];
    if (weather && aqi) {
      const aqiVal = aqi.current.aqi || 0;
      const uv     = weather.current.uvIndex || 0;
      const wind   = weather.current.windSpeed || 0;
      const locStr = location?.name || 'Your location';
      const next   = weather.hourly?.findIndex(h => h.precipProb >= 50) ?? -1;
      if (aqiVal > 100) items.push({ icon:'🌿', bg:'rgba(249,115,22,.18)', title: aqiVal > 150 ? 'Unhealthy Air Quality' : 'Moderate AQI', desc:'AQI '+aqiVal+' · '+locStr, time:'Right now', badge:'Active', cls:'active-badge' });
      else if (aqiVal > 0) items.push({ icon:'🌿', bg:'rgba(34,197,94,.15)', title:'Air Quality Good', desc:'AQI '+aqiVal+' — safe outdoors', time:timeAgo(ts)||'Right now', badge:'Good', cls:'upcoming-badge' });
      if (next >= 0) { const pct = weather.hourly[next].precipProb; items.push({ icon:'🌧', bg:'rgba(59,130,246,.18)', title: pct>=70?'Heavy Rain Expected':'Rain Possible', desc:pct+'% chance · '+locStr, time:next===0?'Now':'In '+next+'h', badge:'Upcoming', cls:'upcoming-badge' }); }
      if (uv >= 7) items.push({ icon:'☀️', bg:'rgba(234,179,8,.18)', title: uv>=10?'Extreme UV Alert':'High UV Index', desc:'UV '+uv+' — use sunscreen', time:'Right now', badge:uv>=10?'Extreme':'High', cls:'active-badge' });
      if (wind >= 40) items.push({ icon:'💨', bg:'rgba(139,92,246,.18)', title: wind>=60?'Strong Wind Warning':'Gusty Winds', desc:Math.round(wind)+' km/h · '+locStr, time:'Right now', badge:'Active', cls:'active-badge' });
    }
    if (items.length === 0) items.push(
      { icon:'🌧', bg:'rgba(59,130,246,.15)', title:'Heavy Rain Alert',  desc:'Heavy rain expected in your area', time:'Today',    badge:'Active',   cls:'active-badge'   },
      { icon:'💨', bg:'rgba(249,115,22,.15)', title:'Strong Wind Alert', desc:'Winds up to 40 km/h detected',    time:'Today',    badge:'Active',   cls:'active-badge'   },
      { icon:'☀️', bg:'rgba(234,179,8,.15)',  title:'High UV Index',     desc:'UV may reach very high levels',   time:'Tomorrow', badge:'Upcoming', cls:'upcoming-badge' }
    );
    return items.slice(0, 3);
  }

  function buildNotifHTML() {
    const items = buildNotifItems();
    const ts = getLiveData().ts;
    const upd = ts ? ' <span style="font-size:10px;opacity:.4;font-weight:400">· updated '+timeAgo(ts)+'</span>' : '';
    const rows = items.map(a =>
      '<a href="'+ALERTS_HREF+'" class="dropdown-item" style="text-decoration:none;color:inherit">'+
      '<div class="di-icon" style="background:'+a.bg+'">'+a.icon+'</div>'+
      '<div class="di-body"><div class="di-title">'+a.title+'</div><div class="di-desc">'+a.desc+'</div><div class="di-time">'+a.time+'</div></div>'+
      '<span class="di-badge '+a.cls+'">'+a.badge+'</span></a>'
    ).join('');
    return '<div class="topbar-dropdown" id="nav-alerts-dd">'+
      '<div class="dropdown-header"><span>Notifications'+upd+'</span><a href="'+ALERTS_HREF+'">View all →</a></div>'+
      rows+
      '<div style="padding:10px 16px;text-align:center"><a href="'+ALERTS_HREF+'" style="font-size:var(--text-xs);color:var(--color-brand);font-weight:600;text-decoration:none">Manage alert preferences</a></div>'+
      '</div>';
  }


  /* ── 5. PROFILE HTML ─────────────────────────────────────── */
  function buildProfileHTML() {
    const { weather, aqi, location, ts } = getLiveData();
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const themeLabel = cur === 'dark' ? '&#9728;&#65039; Switch to Light' : '&#127769; Switch to Dark';
    const locName = location?.name || 'Location not set';
    let wb = '';
    if (weather && aqi) {
      const score = calcScore(weather, aqi.current.aqi);
      const wIcons = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',61:'🌧',63:'🌧',65:'🌧',71:'🌨',80:'🌦',95:'⛈'};
      const wIcon = wIcons[weather.current.weatherCode] || '🌡';
      const sc = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#f97316';
      wb = '<div style="padding:10px 14px 2px;display:flex;gap:8px">'+
        '<div style="flex:1;background:var(--bg-input);border-radius:10px;padding:9px 11px">'+
          '<div style="font-size:10px;opacity:.5;margin-bottom:2px">Current</div>'+
          '<div style="font-size:14px;font-weight:700">'+wIcon+' '+Math.round(weather.current.temp)+'°C</div>'+
          '<div style="font-size:10px;opacity:.55;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+locName+'</div>'+
        '</div>'+
        '<div style="flex:1;background:var(--bg-input);border-radius:10px;padding:9px 11px">'+
          '<div style="font-size:10px;opacity:.5;margin-bottom:2px">AeroScore™</div>'+
          '<div style="font-size:14px;font-weight:700;color:'+sc+'">'+score+'/100</div>'+
          '<div style="font-size:10px;opacity:.55;margin-top:2px">'+(ts?'Updated '+timeAgo(ts):'No data')+'</div>'+
        '</div>'+
      '</div>';
    }
    return '<div class="topbar-dropdown profile-dropdown" id="nav-profile-dd">'+
      '<div class="profile-header">'+
        '<div class="profile-avatar-lg">B</div>'+
        '<div><div class="profile-name">Bharath Arakali</div><div class="profile-email">bharath.arakali@gmail.com</div></div>'+
      '</div>'+
      wb+
      '<div style="height:1px;background:var(--border-primary);margin:10px 0 4px"></div>'+
      '<div class="profile-menu-item" id="pd-theme">'+
        '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/></svg>'+
        themeLabel+
      '</div>'+
      '<a href="'+HOME_HREF+'" class="profile-menu-item" style="text-decoration:none;color:inherit">'+
        '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>'+
        '<span style="flex:1">Location</span>'+
        '<span style="font-size:11px;opacity:.5;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+locName+'</span>'+
      '</a>'+
      '<a href="'+SETTINGS_HREF+'" class="profile-menu-item" style="text-decoration:none;color:inherit">'+
        '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9"/></svg>'+
        'Preferences &amp; Units'+
      '</a>'+
      '<a href="'+ALERTS_HREF+'" class="profile-menu-item" style="text-decoration:none;color:inherit">'+
        '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M15 17H20L18.595 15.595A1 1 0 0118 14.808V11a6 6 0 10-12 0v3.808a1 1 0 01-.595.797L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>'+
        'Alert Settings'+
      '</a>'+
      '<div style="height:1px;background:var(--border-primary);margin:4px 0"></div>'+
      '<div class="profile-menu-item" id="pd-refloc">'+
        '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline stroke-linecap="round" points="1 4 1 10 7 10"/><path stroke-linecap="round" d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>'+
        'Refresh Location'+
      '</div>'+
      '<div class="profile-menu-item danger" id="pd-clear">'+
        '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>'+
        'Clear All Cache'+
      '</div>'+
    '</div>';
  }

  function wireProfile(dd) {
    const tb = dd.querySelector('#pd-theme');
    if (tb) tb.addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      closeAll();
    });
    const rl = dd.querySelector('#pd-refloc');
    if (rl) rl.addEventListener('click', () => {
      localStorage.removeItem('aerosense_location');
      closeAll();
      window.location.href = HOME_HREF;
    });
    const cl = dd.querySelector('#pd-clear');
    if (cl) cl.addEventListener('click', () => {
      if (confirm('Clear all cached weather data?\nPage will reload.')) {
        Object.keys(localStorage).filter(k => k.startsWith('aerosense_')).forEach(k => localStorage.removeItem(k));
        closeAll();
        location.reload();
      }
    });
  }


  /* ── 6. WIRE BUTTONS ─────────────────────────────────────── */
  function injectDropdowns() {
    document.querySelectorAll('.topbar-actions').forEach(bar => {
      /* Bell */
      const bell = bar.querySelector('[aria-label="Notifications"]');
      if (bell && !bell._n) {
        bell._n = 1;
        bell.addEventListener('click', function(e) {
          e.stopPropagation();
          if (_portal && _portal.id === 'nav-alerts-dd') { closeAll(); return; }
          openPortal(bell, buildNotifHTML(), null);
        });
      }
      /* Avatar */
      const av = bar.querySelector('.avatar-btn');
      if (av && !av._n) {
        av._n = 1;
        av.style.cursor = 'pointer';
        av.setAttribute('role', 'button');
        av.setAttribute('tabindex', '0');
        av.addEventListener('click', function(e) {
          e.stopPropagation();
          if (_portal && _portal.id === 'nav-profile-dd') { closeAll(); return; }
          openPortal(av, buildProfileHTML(), wireProfile);
        });
        av.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); av.click(); }
        });
      }
    });
    if (!document._navWired) {
      document._navWired = 1;
      document.addEventListener('click', closeAll);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeAll(); });
      window.addEventListener('resize', closeAll);
      window.addEventListener('scroll', closeAll, true);
    }
  }

  /* ── 6b. ALERTS BADGE (consistent across all pages) ───────── */
  function updateAlertsBadge() {
    const { weather, aqi } = getLiveData();
    const aqiVal = aqi?.current?.aqi ?? 78;
    const uv = weather?.current?.uvIndex ?? 8;
    let count = 2; // rain + wind always active
    if (uv >= 7) count++;
    if (aqiVal > 100) count++;
    const sig = 'c' + count;
    let seen = null;
    try { seen = localStorage.getItem('aerosense_alerts_seen_sig'); } catch (e) {}
    const unseen = (seen === sig) ? 0 : count;
    document.querySelectorAll('.alerts-badge').forEach(el => {
      el.textContent = unseen;
      el.style.display = unseen ? '' : 'none';
    });
  }

  /* ── 7. BOOT ─────────────────────────────────────────────── */
  function boot() {
    injectPNGLogo();
    setupThemeToggle();
    injectDropdowns();
    updateAlertsBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
