/* ============================================================
   AeroSense – compare.js
   City comparison engine: CityScore™, metrics, activities,
   charts, forecast, and side-by-side radar maps.
   ============================================================ */

import Storage from './storage.js';
import { fetchWeather } from './weather.js';
import { fetchAQI } from './aqi.js';

// ── State ──────────────────────────────────────────────────
const state = {
  cityA: null, cityB: null,
  weatherA: null, weatherB: null,
  aqiA: null, aqiB: null,
  mapA: null, mapB: null,
  radarChart: null, barChart: null,
  forecastMode: 'hourly',
};

const STORAGE_KEY = 'aerosense_compare_history';
const MAX_HISTORY = 6;

// ── Helpers ────────────────────────────────────────────────
const el = id => document.getElementById(id);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function aqiLabel(aqi) {
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function scoreLabel(s) {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Good';
  if (s >= 55) return 'Fair';
  if (s >= 40) return 'Poor';
  return 'Very Poor';
}

// ── Geocode ────────────────────────────────────────────────
// Common alternate/old names → official API names
const CITY_ALIASES = {
  // ── Major renames (old colonial / anglicised → official) ──────────────────
  'bangalore':     'bengaluru',    'bombay':        'mumbai',
  'calcutta':      'kolkata',      'madras':        'chennai',
  'poona':         'pune',         'baroda':        'vadodara',
  'trivandrum':    'thiruvananthapuram',
  'calicut':       'kozhikode',    'cochin':        'kochi',
  'mysore':        'mysuru',       'mangalore':     'mangaluru',
  'hubli':         'hubballi',     'ooty':          'udhagamandalam',
  'simla':         'shimla',       'mussoorie':     'mussoorie',
  'trichur':       'thrissur',     'pondicherry':   'puducherry',
  'pondichery':    'puducherry',   'quilon':        'kollam',
  'alleppey':      'alappuzha',    'trichur':       'thrissur',
  'palghat':       'palakkad',     'cannanore':     'kannur',
  'tellicherry':   'thalassery',   'badagara':      'vatakara',
  'beypore':       'beypore',      'malappuram':    'malappuram',
  'shoranur':      'shoranur',     'ottapalam':     'ottapalam',
  // ── Karnataka extra ──────────────────────────────────────────────────────
  'belgaum':       'belagavi',     'bellary':       'ballari',
  'bijapur':       'vijayapura',   'gulbarga':      'kalaburagi',
  'bidar':         'bidar',        'raichur':       'raichur',
  'davangere':     'davangere',    'shimoga':       'shivamogga',
  'tumkur':        'tumakuru',     'chitradurga':   'chitradurga',
  'hassan':        'hassan',       'mandya':        'mandya',
  'chikmagalur':   'chikkamagaluru','kodagu':       'madikeri',
  'coorg':         'madikeri',     'madikeri':      'madikeri',
  'udupi':         'udupi',        'kundapura':     'kundapura',
  'dharwad':       'dharwad',      'gadag':         'gadag',
  'hospet':        'hosapete',     'hampi':         'hosapete',
  'bagalkot':      'bagalkot',     'koppal':        'koppal',
  'yadgir':        'yadgiri',      'chamarajanagar':'chamarajanagara',
  'kolar':         'kolar',        'chikballapur':  'chikkaballapura',
  'ramanagara':    'ramanagara',   'ramnagara':     'ramanagara',
  // ── Andhra Pradesh / Telangana ────────────────────────────────────────────
  'hyderabad':     'hyderabad',    'secunderabad':  'hyderabad',
  'visakhapatnam': 'visakhapatnam','vizag':         'visakhapatnam',
  'vijayawada':    'vijayawada',   'guntur':        'guntur',
  'tirupati':      'tirupati',     'nellore':       'nellore',
  'kurnool':       'kurnool',      'rajahmundry':   'rajahmundry',
  'rajamahendravaram':'rajahmundry','kakinada':     'kakinada',
  'anantapur':     'anantapur',    'kadapa':        'kadapa',
  'cuddapah':      'kadapa',       'nalgonda':      'nalgonda',
  'warangal':      'warangal',     'khammam':       'khammam',
  'nizamabad':     'nizamabad',    'karimnagar':    'karimnagar',
  'mahbubnagar':   'mahbubnagar',  'adilabad':      'adilabad',
  // ── Tamil Nadu ────────────────────────────────────────────────────────────
  'coimbatore':    'coimbatore',   'trichy':        'tiruchirappalli',
  'trichinopoly':  'tiruchirappalli','trichirappalli':'tiruchirappalli',
  'madurai':       'madurai',      'salem':         'salem',
  'tirunelveli':   'tirunelveli',  'erode':         'erode',
  'vellore':       'vellore',      'thoothukudi':   'thoothukudi',
  'tuticorin':     'thoothukudi',  'tiruppur':      'tiruppur',
  'dindigul':      'dindigul',     'thanjavur':     'thanjavur',
  'tanjore':       'thanjavur',    'cuddalore':     'cuddalore',
  'kanchipuram':   'kanchipuram',  'tiruvannamalai':'tiruvannamalai',
  'nagapattinam':  'nagapattinam', 'nagercoil':     'nagercoil',
  'ramanathapuram':'ramanathapuram','sivaganga':    'sivaganga',
  'virudhunagar':  'virudhunagar', 'krishnagiri':   'krishnagiri',
  'dharmapuri':    'dharmapuri',   'viluppuram':    'viluppuram',
  'perambalur':    'perambalur',   'ariyalur':      'ariyalur',
  'namakkal':      'namakkal',     'karur':         'karur',
  'tiruvarur':     'tiruvarur',    'pudukkottai':   'pudukkottai',
  // ── Maharashtra ───────────────────────────────────────────────────────────
  'nashik':        'nashik',       'aurangabad':    'chhatrapati sambhajinagar',
  'sambhajinagar': 'chhatrapati sambhajinagar',
  'solapur':       'solapur',      'amravati':      'amravati',
  'nagpur':        'nagpur',       'kolhapur':      'kolhapur',
  'satara':        'satara',       'sangli':        'sangli',
  'jalgaon':       'jalgaon',      'akola':         'akola',
  'latur':         'latur',        'nanded':        'nanded',
  'osmanabad':     'dharashiv',    'chandrapur':    'chandrapur',
  'gondiya':       'gondia',       'bhandara':      'bhandara',
  'washim':        'washim',       'yavatmal':      'yavatmal',
  'nandurbar':     'nandurbar',    'dhule':         'dhule',
  'ahmednagar':    'ahmednagar',   'raigad':        'raigad',
  'sindhudurg':    'sindhudurg',   'ratnagiri':     'ratnagiri',
  'thane':         'thane',        'navi mumbai':   'navi mumbai',
  'pune':          'pune',
  // ── Gujarat ───────────────────────────────────────────────────────────────
  'ahmedabad':     'ahmedabad',    'surat':         'surat',
  'rajkot':        'rajkot',       'bhavnagar':     'bhavnagar',
  'jamnagar':      'jamnagar',     'junagadh':      'junagadh',
  'anand':         'anand',        'gandhinagar':   'gandhinagar',
  'nadiad':        'nadiad',       'bharuch':       'bharuch',
  'broach':        'bharuch',      'navsari':       'navsari',
  'valsad':        'valsad',       'amreli':        'amreli',
  'botad':         'botad',        'morbi':         'morbi',
  'surendranagar': 'surendranagar','dahod':         'dahod',
  'panchmahal':    'godhra',       'godhra':        'godhra',
  'kheda':         'kheda',        'mehsana':       'mehsana',
  'banaskantha':   'palanpur',     'palanpur':      'palanpur',
  'patan':         'patan',        'sabarkantha':   'himmatnagar',
  'himmatnagar':   'himmatnagar',  'kutch':         'bhuj',
  'bhuj':          'bhuj',         'gandhidham':    'gandhidham',
  // ── Rajasthan ─────────────────────────────────────────────────────────────
  'jaipur':        'jaipur',       'jodhpur':       'jodhpur',
  'udaipur':       'udaipur',      'kota':          'kota',
  'bikaner':       'bikaner',      'ajmer':         'ajmer',
  'alwar':         'alwar',        'bharatpur':     'bharatpur',
  'sikar':         'sikar',        'jhunjhunu':     'jhunjhunu',
  'churu':         'churu',        'nagaur':        'nagaur',
  'pali':          'pali',         'barmer':        'barmer',
  'jaisalmer':     'jaisalmer',    'sirohi':        'sirohi',
  'dungarpur':     'dungarpur',    'banswara':      'banswara',
  'chittorgarh':   'chittorgarh',  'bhilwara':      'bhilwara',
  'bundi':         'bundi',        'sawai madhopur':'sawai madhopur',
  'tonk':          'tonk',         'baran':         'baran',
  'dholpur':       'dholpur',      'karauli':       'karauli',
  // ── Madhya Pradesh ───────────────────────────────────────────────────────
  'bhopal':        'bhopal',       'indore':        'indore',
  'gwalior':       'gwalior',      'jabalpur':      'jabalpur',
  'ujjain':        'ujjain',       'sagar':         'sagar',
  'rewa':          'rewa',         'satna':         'satna',
  'ratlam':        'ratlam',       'dewas':         'dewas',
  'shivpuri':      'shivpuri',     'morena':        'morena',
  'bhind':         'bhind',        'damoh':         'damoh',
  'chhindwara':    'chhindwara',   'vidisha':       'vidisha',
  'khargone':      'khargone',     'hoshangabad':   'narmadapuram',
  'narmadapuram':  'narmadapuram', 'mandla':        'mandla',
  'balaghat':      'balaghat',     'seoni':         'seoni',
  'shahdol':       'shahdol',      'umaria':        'umaria',
  'katni':         'katni',        'sidhi':         'sidhi',
  'neemuch':       'neemuch',      'mandsaur':      'mandsaur',
  // ── Uttar Pradesh ────────────────────────────────────────────────────────
  'lucknow':       'lucknow',      'kanpur':        'kanpur',
  'cawnpore':      'kanpur',       'agra':          'agra',
  'varanasi':      'varanasi',     'benares':       'varanasi',
  'banaras':       'varanasi',     'allahabad':     'prayagraj',
  'prayagraj':     'prayagraj',    'meerut':        'meerut',
  'ghaziabad':     'ghaziabad',    'noida':         'noida',
  'bareilly':      'bareilly',     'aligarh':       'aligarh',
  'moradabad':     'moradabad',    'gorakhpur':     'gorakhpur',
  'firozabad':     'firozabad',    'jhansi':        'jhansi',
  'mathura':       'mathura',      'vrindavan':     'mathura',
  'muzaffarnagar': 'muzaffarnagar','shahjahanpur':  'shahjahanpur',
  'rampur':        'rampur',       'hapur':         'hapur',
  'sitapur':       'sitapur',      'lakhimpur':     'lakhimpur',
  'ayodhya':       'ayodhya',      'faizabad':      'ayodhya',
  'sultanpur':     'sultanpur',    'rae bareli':    'rae bareli',
  'fatehpur':      'fatehpur',     'unnao':         'unnao',
  'hardoi':        'hardoi',       'deoria':        'deoria',
  'azamgarh':      'azamgarh',     'mau':           'mau',
  'ballia':        'ballia',       'basti':         'basti',
  'ambedkar nagar':'ambedkar nagar','jaunpur':      'jaunpur',
  'mirzapur':      'mirzapur',     'sonbhadra':     'sonbhadra',
  'chandauli':     'chandauli',    'ghazipur':      'ghazipur',
  // ── Delhi & NCR ──────────────────────────────────────────────────────────
  'delhi':         'new delhi',    'new delhi':     'new delhi',
  'gurgaon':       'gurugram',     'gurugram':      'gurugram',
  'faridabad':     'faridabad',    'noida':         'noida',
  'greater noida': 'greater noida','dwarka':        'new delhi',
  // ── Punjab & Haryana ─────────────────────────────────────────────────────
  'chandigarh':    'chandigarh',   'amritsar':      'amritsar',
  'ludhiana':      'ludhiana',     'jalandhar':     'jalandhar',
  'patiala':       'patiala',      'bathinda':      'bathinda',
  'mohali':        'mohali',       'pathankot':     'pathankot',
  'hoshiarpur':    'hoshiarpur',   'ferozepur':     'ferozepur',
  'rohtak':        'rohtak',       'panipat':       'panipat',
  'karnal':        'karnal',       'hisar':         'hisar',
  'sonipat':       'sonipat',      'ambala':        'ambala',
  'yamunanagar':   'yamunanagar',  'sirsa':         'sirsa',
  'kurukshetra':   'kurukshetra',  'rewari':        'rewari',
  'palwal':        'palwal',       'jhajjar':       'jhajjar',
  // ── Himachal Pradesh & Uttarakhand ───────────────────────────────────────
  'shimla':        'shimla',       'dharamsala':    'dharamshala',
  'manali':        'manali',       'kullu':         'kullu',
  'mandi':         'mandi',        'bilaspur':      'bilaspur',
  'dehradun':      'dehradun',     'haridwar':      'haridwar',
  'rishikesh':     'rishikesh',    'nainital':      'nainital',
  'almora':        'almora',       'haldwani':      'haldwani',
  'rudrapur':      'rudrapur',     'kashipur':      'kashipur',
  'roorkee':       'roorkee',      'kotdwar':       'kotdwar',
  'tehri':         'tehri garhwal','uttarkashi':    'uttarkashi',
  'pithoragarh':   'pithoragarh',  'bageshwar':     'bageshwar',
  // ── Bihar & Jharkhand ────────────────────────────────────────────────────
  'patna':         'patna',        'gaya':          'gaya',
  'muzaffarpur':   'muzaffarpur',  'bhagalpur':     'bhagalpur',
  'darbhanga':     'darbhanga',    'arrah':         'arrah',
  'buxar':         'buxar',        'sasaram':       'sasaram',
  'begusarai':     'begusarai',    'munger':        'munger',
  'samastipur':    'samastipur',   'purnia':        'purnia',
  'katihar':       'katihar',      'nalanda':       'nalanda',
  'ranchi':        'ranchi',       'jamshedpur':    'jamshedpur',
  'dhanbad':       'dhanbad',      'bokaro':        'bokaro',
  'deoghar':       'deoghar',      'hazaribagh':    'hazaribagh',
  'giridih':       'giridih',      'ramgarh':       'ramgarh',
  // ── West Bengal & Odisha ─────────────────────────────────────────────────
  'kolkata':       'kolkata',      'howrah':        'howrah',
  'siliguri':      'siliguri',     'darjeeling':    'darjeeling',
  'asansol':       'asansol',      'durgapur':      'durgapur',
  'burdwan':       'bardhaman',    'bardhaman':     'bardhaman',
  'haldia':        'haldia',       'kharagpur':     'kharagpur',
  'bhubaneswar':   'bhubaneswar',  'cuttack':       'cuttack',
  'rourkela':      'rourkela',     'berhampur':     'brahmapur',
  'brahmapur':     'brahmapur',    'balasore':      'baleshwar',
  'puri':          'puri',         'sambalpur':     'sambalpur',
  'koraput':       'koraput',
  // ── North-East India ─────────────────────────────────────────────────────
  'guwahati':      'guwahati',     'gauhati':       'guwahati',
  'dibrugarh':     'dibrugarh',    'jorhat':        'jorhat',
  'silchar':       'silchar',      'tezpur':        'tezpur',
  'shillong':      'shillong',     'aizawl':        'aizawl',
  'imphal':        'imphal',       'agartala':      'agartala',
  'kohima':        'kohima',       'gangtok':       'gangtok',
  'itanagar':      'itanagar',     'dispur':        'guwahati',
  // ── Goa ──────────────────────────────────────────────────────────────────
  'panaji':        'panaji',       'panjim':        'panaji',
  'margao':        'margao',       'vasco':         'vasco da gama',
  'vasco da gama': 'vasco da gama','mapusa':        'mapusa',
  'ponda':         'ponda',
  // ── Chhattisgarh ─────────────────────────────────────────────────────────
  'raipur':        'raipur',       'bhilai':        'bhilai',
  'bilaspur':      'bilaspur',     'korba':         'korba',
  'durg':          'durg',         'raigarh':       'raigarh',
  'jagdalpur':     'jagdalpur',    'ambikapur':     'ambikapur',
  // ── J&K, Ladakh, HP hills ────────────────────────────────────────────────
  'srinagar':      'srinagar',     'jammu':         'jammu',
  'leh':           'leh',          'kargil':        'kargil',
  'sopore':        'sopore',       'anantnag':      'anantnag',
  'baramulla':     'baramulla',    'kathua':        'kathua',
  // ── International ────────────────────────────────────────────────────────
  'peking':        'beijing',      'rangoon':       'yangon',
  'saigon':        'ho chi minh city', 'canton':    'guangzhou',
  'bombay':        'mumbai',
};

function countryFlagEmoji(cc) {
  if (!cc || cc.length !== 2) return '';
  const base = 0x1F1E6 - 65;
  return String.fromCodePoint(base + cc.toUpperCase().charCodeAt(0)) +
         String.fromCodePoint(base + cc.toUpperCase().charCodeAt(1));
}

async function fetchGeocode(term) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=10&language=en&format=json`;
    const r = await fetch(url);
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

async function geocode(q) {
  const raw = q.trim().toLowerCase();
  const alias = CITY_ALIASES[raw];

  // Run searches in parallel: original query + alias (if different)
  const searches = alias ? [q, alias] : [q];
  const batches = await Promise.all(searches.map(fetchGeocode));

  // Merge, deduplicate by lat/lon grid cell, sort by population desc
  const seen = new Set();
  const merged = [];
  for (const batch of batches) {
    for (const r of batch) {
      const key = `${Math.round(r.latitude * 2)},${Math.round(r.longitude * 2)}`;
      if (!seen.has(key)) { seen.add(key); merged.push(r); }
    }
  }
  merged.sort((a, b) => (b.population || 0) - (a.population || 0));
  return merged.slice(0, 8);
}

// ── CityScore™ calculation ─────────────────────────────────
function calcCityScore(weather, aqi) {
  const c = weather?.current;
  if (!c) return { total: 0, components: {} };

  const aqiVal  = aqi?.current?.aqi ?? 60;
  const temp    = c.temp ?? 22;
  const humidity= c.humidity ?? 50;
  const uv      = c.uvIndex ?? 3;
  const wind    = c.windSpeed ?? 10;
  const rain    = weather?.daily?.[0]?.precipProb ?? 20;

  const aqiScore  = clamp(100 - (aqiVal / 3), 0, 100);
  const tempScore = clamp(100 - Math.abs(temp - 22) * 3.5, 0, 100);
  const humScore  = clamp(100 - Math.abs(humidity - 50) * 1.4, 0, 100);
  const uvScore   = clamp(100 - uv * 9, 0, 100);
  const windScore = clamp(100 - wind * 1.8, 0, 100);
  const rainScore = clamp(100 - rain, 0, 100);

  const total = Math.round(
    aqiScore  * 0.40 +
    tempScore * 0.20 +
    humScore  * 0.15 +
    uvScore   * 0.10 +
    windScore * 0.10 +
    rainScore * 0.05
  );

  return { total, components: { aqiScore, tempScore, humScore, uvScore, windScore, rainScore } };
}

// ── Activity scores ────────────────────────────────────────
const ACTIVITIES = [
  { key: 'walking',    label: 'Walking',    icon: '🚶', weights: { aqi: 0.40, temp: 0.25, hum: 0.20, uv: 0.10, wind: 0.05 } },
  { key: 'running',    label: 'Running',    icon: '🏃', weights: { aqi: 0.45, temp: 0.20, hum: 0.15, uv: 0.10, wind: 0.10 } },
  { key: 'cycling',    label: 'Cycling',    icon: '🚴', weights: { aqi: 0.40, temp: 0.20, hum: 0.15, uv: 0.10, wind: 0.15 } },
  { key: 'hiking',     label: 'Hiking',     icon: '🥾', weights: { aqi: 0.35, temp: 0.25, hum: 0.20, uv: 0.15, wind: 0.05 } },
  { key: 'cricket',    label: 'Cricket',    icon: '🏏', weights: { aqi: 0.30, temp: 0.30, hum: 0.20, uv: 0.10, wind: 0.10 } },
  { key: 'photo',      label: 'Photography',icon: '📷', weights: { aqi: 0.20, temp: 0.10, hum: 0.10, uv: 0.20, wind: 0.10 } },
  { key: 'picnic',     label: 'Picnic',     icon: '🧺', weights: { aqi: 0.35, temp: 0.30, hum: 0.15, uv: 0.10, wind: 0.10 } },
  { key: 'stargazing', label: 'Stargazing', icon: '🔭', weights: { aqi: 0.30, temp: 0.15, hum: 0.20, uv: 0.05, wind: 0.10 } },
];

function calcActivityScore(activity, weather, aqi) {
  const c = weather?.current;
  if (!c) return 0;
  const aqiVal  = aqi?.current?.aqi ?? 60;
  const temp    = c.temp ?? 22;
  const humidity= c.humidity ?? 50;
  const uv      = c.uvIndex ?? 3;
  const wind    = c.windSpeed ?? 10;
  const cloud   = c.cloudCover ?? 30;

  const sc = {
    aqi:  clamp(100 - aqiVal / 3,              0, 100),
    temp: clamp(100 - Math.abs(temp - 22) * 3, 0, 100),
    hum:  clamp(100 - Math.abs(humidity - 55) * 1.5, 0, 100),
    uv:   clamp(100 - uv * 9,                  0, 100),
    wind: clamp(100 - wind * 2,                0, 100),
  };

  // Stargazing bonus: clear skies
  if (activity.key === 'stargazing') sc.cloud = clamp(100 - cloud, 0, 100);
  // Photography: good for overcast (softer light)
  if (activity.key === 'photo') sc.uv = clamp(100 - Math.abs(uv - 4) * 8, 0, 100);

  const w = activity.weights;
  return Math.round(
    (sc.aqi || 0)  * (w.aqi  || 0) +
    (sc.temp || 0) * (w.temp || 0) +
    (sc.hum || 0)  * (w.hum  || 0) +
    (sc.uv || 0)   * (w.uv   || 0) +
    (sc.wind || 0) * (w.wind || 0)
  );
}

// ── Search UI ──────────────────────────────────────────────
function setupSearch(slot) {
  const inp   = el(`input-${slot}`);
  const res   = el(`results-${slot}`);
  const clearBtn = el(`clear-${slot}`);

  const doSearch = debounce(async () => {
    const q = inp.value.trim();
    clearBtn.style.display = q ? '' : 'none';
    if (!q) { res.style.display = 'none'; return; }
    res.style.display = '';
    res.innerHTML = '<div class="ccs-searching"><div class="cs-spinner"></div><span>Searching…</span></div>';
    const results = await geocode(q);
    if (!results.length) {
      res.innerHTML = '<div class="ccs-empty">No results found</div>';
      return;
    }

    const userCC = (Storage.getUserCountry?.()?.code || '').toUpperCase();
    const same  = userCC ? results.filter(r => (r.country_code||'').toUpperCase() === userCC) : results;
    const other = userCC ? results.filter(r => (r.country_code||'').toUpperCase() !== userCC) : [];
    const display = same.length ? same : results;

    function ccsItem(r, i) {
      const flag = countryFlagEmoji(r.country_code);
      const parts = [r.admin1, r.country].filter(Boolean);
      const sub = parts.join(' · ');
      const pop = r.population ? (r.population >= 1e6 ? (r.population/1e6).toFixed(1)+'M' : (r.population/1e3).toFixed(0)+'K') : '';
      const fullName = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
      return `<div class="ccs-result-item" data-idx="${i}" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${fullName.replace(/"/g,'&quot;')}">
        <div class="ccri-flag">${flag}</div>
        <div class="ccri-info">
          <div class="ccri-name">${r.name}</div>
          <div class="ccri-sub">${sub}${pop ? ' <span class="ccri-pop">'+pop+'</span>' : ''}</div>
        </div>
      </div>`;
    }

    let html = display.map((r,i) => ccsItem(r,i)).join('');
    if (same.length && other.length) {
      html += `<div class="ccs-expand-btn" data-side="${side}">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
        Show ${other.length} more from other countries
      </div>`;
    }
    res.innerHTML = html;

    // expand handler
    const expandBtn = res.querySelector('.ccs-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        expandBtn.remove();
        const startIdx = display.length;
        other.forEach((r,j) => {
          res.insertAdjacentHTML('beforeend', ccsItem(r, startIdx+j));
        });
        res.querySelectorAll('.ccs-result-item:not([data-bound])').forEach(item => {
          item.dataset.bound = '1';
          item.addEventListener('click', () => {
            const city = { lat: parseFloat(item.dataset.lat), lon: parseFloat(item.dataset.lon), name: item.dataset.name };
            selectCity(side, city);
          });
        });
      });
    }
    res.querySelectorAll('.ccs-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const city = { lat: parseFloat(item.dataset.lat), lon: parseFloat(item.dataset.lon), name: item.dataset.name };
        selectCity(slot, city);
      });
    });
  }, 300);

  inp.addEventListener('input', doSearch);
  clearBtn.addEventListener('click', () => { inp.value = ''; clearBtn.style.display = 'none'; res.style.display = 'none'; clearCity(slot); });
}

function selectCity(slot, city) {
  state[`city${slot.toUpperCase()}`] = city;
  el(`results-${slot}`).style.display = 'none';
  el(`input-${slot}`).style.display = 'none';
  el(`clear-${slot}`).style.display = 'none';
  el(`selected-${slot}`).style.display = '';
  el(`sel-name-${slot}`).textContent = city.name;
  checkBothSelected();
}

window.clearCity = slot => {
  state[`city${slot.toUpperCase()}`] = null;
  el(`input-${slot}`).style.display = '';
  el(`input-${slot}`).value = '';
  el(`clear-${slot}`).style.display = 'none';
  el(`selected-${slot}`).style.display = 'none';
  checkBothSelected();
};

function checkBothSelected() {
  el('btn-compare').disabled = !(state.cityA && state.cityB);
}

// ── Main compare flow ──────────────────────────────────────
async function runCompare() {
  if (!state.cityA || !state.cityB) return;
  el('cmp-loading').style.display = '';
  el('compare-results').style.display = 'none';
  // Hide empty state (popular pairs + feature cards) once a comparison runs
  const emptyState = el('cmp-empty-state');
  if (emptyState) emptyState.style.display = 'none';

  try {
    const [wA, wB, aA, aB] = await Promise.all([
      fetchWeather(state.cityA.lat, state.cityA.lon),
      fetchWeather(state.cityB.lat, state.cityB.lon),
      fetchAQI(state.cityA.lat, state.cityA.lon),
      fetchAQI(state.cityB.lat, state.cityB.lon),
    ]);
    state.weatherA = wA; state.weatherB = wB;
    state.aqiA = aA; state.aqiB = aB;

    saveHistory();
    renderResults();
    el('cmp-loading').style.display = 'none';
    el('compare-results').style.display = '';
    renderResetBtn();
    el('compare-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    el('cmp-loading').style.display = 'none';
    if (emptyState) emptyState.style.display = '';
    console.error('Compare failed:', e);
  }
}

// ── Render Results ─────────────────────────────────────────
function renderResetBtn() {
  // Add/refresh a "New Comparison" button at the top of the results pane
  let btn = el('cmp-reset-btn');
  if (!btn) {
    btn = document.createElement('div');
    btn.id = 'cmp-reset-btn';
    btn.innerHTML = `
      <button class="cmp-reset-action">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M1 4v6h6M23 20v-6h-6"/><path stroke-linecap="round" d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/></svg>
        New Comparison
      </button>`;
    btn.querySelector('.cmp-reset-action').addEventListener('click', resetComparison);
    const results = el('compare-results');
    results.insertBefore(btn, results.firstChild);
  }
}

function resetComparison() {
  // Clear state
  state.cityA = null; state.cityB = null;
  state.weatherA = null; state.weatherB = null;
  state.aqiA = null; state.aqiB = null;
  // Destroy maps
  if (state.mapA) { state.mapA.remove(); state.mapA = null; }
  if (state.mapB) { state.mapB.remove(); state.mapB = null; }
  if (state.radarChart) { state.radarChart.destroy(); state.radarChart = null; }
  if (state.barChart)   { state.barChart.destroy();   state.barChart = null; }
  // Reset city slots
  clearCity('a'); clearCity('b');
  el('input-a').value = ''; el('input-b').value = '';
  // Hide results, show empty state
  el('compare-results').style.display = 'none';
  const emptyState = el('cmp-empty-state');
  if (emptyState) emptyState.style.display = '';
  // Scroll to top of page
  el('compare-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderResults() {
  const scoreA = calcCityScore(state.weatherA, state.aqiA);
  const scoreB = calcCityScore(state.weatherB, state.aqiB);

  renderScoreOverview(scoreA, scoreB);
  renderDecisionCard(scoreA, scoreB);
  renderMetricsTable();
  renderCategoryWinners(scoreA, scoreB);
  renderActivityComparison();
  renderSmartRecs(scoreA, scoreB);
  renderCharts(scoreA, scoreB);
  renderForecast(state.forecastMode);
  renderMaps();
}

// ── Score Overview ─────────────────────────────────────────
function renderScoreOverview(scoreA, scoreB) {
  const nameA = state.cityA.name.split(',')[0];
  const nameB = state.cityB.name.split(',')[0];

  el('score-name-a').textContent = nameA;
  el('score-val-a').textContent  = `${scoreA.total}/100`;
  el('score-label-a').textContent = scoreLabel(scoreA.total);

  el('score-name-b').textContent = nameB;
  el('score-val-b').textContent  = `${scoreB.total}/100`;
  el('score-label-b').textContent = scoreLabel(scoreB.total);

  // Winner highlight
  const cardA = el('score-card-a'), cardB = el('score-card-b');
  const tagA = el('winner-tag-a'), tagB = el('winner-tag-b');
  cardA.classList.remove('winner'); cardB.classList.remove('winner');
  tagA.style.display = 'none'; tagB.style.display = 'none';
  if (scoreA.total >= scoreB.total) { cardA.classList.add('winner'); tagA.style.display = ''; }
  if (scoreB.total >= scoreA.total) { cardB.classList.add('winner'); tagB.style.display = ''; }

  // Breakdown bars
  const comps = [
    { key: 'aqiScore',  label: 'Air Quality', w: '40%' },
    { key: 'tempScore', label: 'Temperature',  w: '20%' },
    { key: 'humScore',  label: 'Humidity',     w: '15%' },
    { key: 'uvScore',   label: 'UV',           w: '10%' },
    { key: 'windScore', label: 'Wind',         w: '10%' },
    { key: 'rainScore', label: 'Rain Risk',    w: '5%'  },
  ];
  el('score-breakdown').innerHTML = comps.map(c => {
    const va = Math.round(scoreA.components[c.key] || 0);
    const vb = Math.round(scoreB.components[c.key] || 0);
    const winA = va >= vb, winB = vb >= va;
    return `<div class="breakdown-row">
      <div class="bdr-val ${winA ? 'bdr-win' : ''}">${va}</div>
      <div class="bdr-label">${c.label}<span class="bdr-weight">${c.w}</span></div>
      <div class="bdr-val ${winB ? 'bdr-win' : ''}">${vb}</div>
    </div>`;
  }).join('');
}

// ── Decision Card ──────────────────────────────────────────
function renderDecisionCard(scoreA, scoreB) {
  const nameA = state.cityA.name.split(',')[0];
  const nameB = state.cityB.name.split(',')[0];
  const winner = scoreA.total >= scoreB.total ? { city: nameA, score: scoreA, other: nameB } : { city: nameB, score: scoreB, other: nameA };

  el('decision-city').textContent = winner.city;

  const cA = state.weatherA?.current, cB = state.weatherB?.current;
  const aqiA = state.aqiA?.current?.aqi ?? 60;
  const aqiB = state.aqiB?.current?.aqi ?? 60;
  const reasons = [];
  if (aqiA < aqiB - 10 && scoreA.total >= scoreB.total) reasons.push('cleaner air');
  if (aqiB < aqiA - 10 && scoreB.total >= scoreA.total) reasons.push('cleaner air');
  if (cA && cB) {
    if (Math.abs((cA.uvIndex || 0) - (cB.uvIndex || 0)) > 1)
      reasons.push(scoreA.components.uvScore > scoreB.components.uvScore ? 'lower UV exposure' : 'better UV conditions');
    if (Math.abs((cA.humidity || 50) - (cB.humidity || 50)) > 10)
      reasons.push('better humidity comfort');
  }
  reasons.push('better overall environmental score');
  el('decision-reason').textContent = `Choose ${winner.city} today because it offers ${reasons.slice(0, 3).join(', ')}.`;
}

// ── Metrics Table ──────────────────────────────────────────
function renderMetricsTable() {
  const cA = state.weatherA?.current || {};
  const cB = state.weatherB?.current || {};
  const aqiA = state.aqiA?.current?.aqi ?? '–';
  const aqiB = state.aqiB?.current?.aqi ?? '–';

  el('tbl-name-a').textContent = state.cityA.name.split(',')[0];
  el('tbl-name-b').textContent = state.cityB.name.split(',')[0];

  const metrics = [
    { label: 'Temperature',  icon: '🌡️', vA: `${Math.round(cA.temp ?? 0)}°C`,              vB: `${Math.round(cB.temp ?? 0)}°C`,              numA: cA.temp,         numB: cB.temp,         lowerBetter: false, comfort: true  },
    { label: 'Feels Like',   icon: '🤔', vA: `${Math.round(cA.feelsLike ?? 0)}°C`,          vB: `${Math.round(cB.feelsLike ?? 0)}°C`,          numA: cA.feelsLike,    numB: cB.feelsLike,    lowerBetter: false, comfort: true  },
    { label: 'AQI',          icon: '💨', vA: `${aqiA}`,                                     vB: `${aqiB}`,                                     numA: +aqiA,           numB: +aqiB,           lowerBetter: true,  comfort: false },
    { label: 'Humidity',     icon: '💧', vA: `${cA.humidity ?? 0}%`,                         vB: `${cB.humidity ?? 0}%`,                         numA: cA.humidity,     numB: cB.humidity,     lowerBetter: false, comfort: true  },
    { label: 'UV Index',     icon: '☀️', vA: `${cA.uvIndex ?? 0}`,                           vB: `${cB.uvIndex ?? 0}`,                           numA: cA.uvIndex,      numB: cB.uvIndex,      lowerBetter: true,  comfort: false },
    { label: 'Wind Speed',   icon: '🌬️', vA: `${Math.round(cA.windSpeed ?? 0)} km/h`,        vB: `${Math.round(cB.windSpeed ?? 0)} km/h`,        numA: cA.windSpeed,    numB: cB.windSpeed,    lowerBetter: true,  comfort: false },
    { label: 'Pressure',     icon: '🔵', vA: `${Math.round(cA.pressure ?? 1013)} hPa`,       vB: `${Math.round(cB.pressure ?? 1013)} hPa`,       numA: null,            numB: null,            lowerBetter: false, comfort: false },
    { label: 'Visibility',   icon: '👁️', vA: `${(cA.visibility ?? 10).toFixed(1)} km`,       vB: `${(cB.visibility ?? 10).toFixed(1)} km`,       numA: cA.visibility,   numB: cB.visibility,   lowerBetter: false, comfort: false },
    { label: 'Cloud Cover',  icon: '☁️', vA: `${cA.cloudCover ?? 0}%`,                       vB: `${cB.cloudCover ?? 0}%`,                       numA: cA.cloudCover,   numB: cB.cloudCover,   lowerBetter: true,  comfort: false },
    { label: 'Rain Prob.',   icon: '🌧️', vA: `${state.weatherA?.daily?.[0]?.precipProb ?? 0}%`, vB: `${state.weatherB?.daily?.[0]?.precipProb ?? 0}%`, numA: state.weatherA?.daily?.[0]?.precipProb ?? 0, numB: state.weatherB?.daily?.[0]?.precipProb ?? 0, lowerBetter: true, comfort: false },
  ];

  el('metrics-table').innerHTML = metrics.map(m => {
    let indA = '≈', indB = '≈', winA = false, winB = false;
    if (m.numA !== null && m.numB !== null && !isNaN(m.numA) && !isNaN(m.numB)) {
      const diff = Math.abs(m.numA - m.numB);
      const threshold = m.comfort ? 3 : 5;
      if (diff > threshold) {
        if (m.comfort) {
          // closer to 22°C (temp) or 50% (humidity) wins
          const idealT = m.label === 'Temperature' || m.label === 'Feels Like' ? 22 : 50;
          winA = Math.abs(m.numA - idealT) < Math.abs(m.numB - idealT);
          winB = !winA;
        } else {
          winA = m.lowerBetter ? m.numA < m.numB : m.numA > m.numB;
          winB = !winA;
        }
        indA = winA ? '↑' : '↓';
        indB = winB ? '↑' : '↓';
      }
    }
    return `<div class="cmp-metric-row">
      <div class="cmr-a ${winA ? 'cmr-win' : ''}">${m.vA} <span class="cmr-ind">${indA}</span></div>
      <div class="cmr-mid"><span class="cmr-icon">${m.icon}</span><span class="cmr-label">${m.label}</span></div>
      <div class="cmr-b ${winB ? 'cmr-win' : ''}">${m.vB} <span class="cmr-ind">${indB}</span></div>
    </div>`;
  }).join('');
}

// ── Category Winners ───────────────────────────────────────
function renderCategoryWinners(scoreA, scoreB) {
  const nameA = state.cityA.name.split(',')[0];
  const nameB = state.cityB.name.split(',')[0];
  const cA = state.weatherA?.current || {};
  const cB = state.weatherB?.current || {};
  const aqiA = state.aqiA?.current?.us_aqi ?? 60;
  const aqiB = state.aqiB?.current?.us_aqi ?? 60;

  const cats = [
    { label: 'Air Quality',        icon: '💨', winner: aqiA <= aqiB ? nameA : nameB },
    { label: 'Comfort',            icon: '😊', winner: scoreA.components.humScore + scoreA.components.tempScore >= scoreB.components.humScore + scoreB.components.tempScore ? nameA : nameB },
    { label: 'Outdoor Activities', icon: '🏃', winner: calcActivityScore(ACTIVITIES[1], state.weatherA, state.aqiA) >= calcActivityScore(ACTIVITIES[1], state.weatherB, state.aqiB) ? nameA : nameB },
    { label: 'Travel',             icon: '✈️', winner: scoreA.total >= scoreB.total ? nameA : nameB },
    { label: 'Photography',        icon: '📷', winner: calcActivityScore(ACTIVITIES[5], state.weatherA, state.aqiA) >= calcActivityScore(ACTIVITIES[5], state.weatherB, state.aqiB) ? nameA : nameB },
    { label: 'Running',            icon: '🏃', winner: calcActivityScore(ACTIVITIES[1], state.weatherA, state.aqiA) >= calcActivityScore(ACTIVITIES[1], state.weatherB, state.aqiB) ? nameA : nameB },
    { label: 'Cycling',            icon: '🚴', winner: calcActivityScore(ACTIVITIES[2], state.weatherA, state.aqiA) >= calcActivityScore(ACTIVITIES[2], state.weatherB, state.aqiB) ? nameA : nameB },
    { label: 'Stargazing',         icon: '🔭', winner: calcActivityScore(ACTIVITIES[7], state.weatherA, state.aqiA) >= calcActivityScore(ACTIVITIES[7], state.weatherB, state.aqiB) ? nameA : nameB },
  ];

  el('category-winners').innerHTML = cats.map(c => `
    <div class="cw-item">
      <div class="cwi-icon">${c.icon}</div>
      <div class="cwi-label">${c.label}</div>
      <div class="cwi-winner">🏆 ${c.winner}</div>
    </div>
  `).join('');
}

// ── Activity Comparison ────────────────────────────────────
function renderActivityComparison() {
  const nameA = state.cityA.name.split(',')[0];
  const nameB = state.cityB.name.split(',')[0];

  el('activity-comparison').innerHTML = ACTIVITIES.map(act => {
    const sA = calcActivityScore(act, state.weatherA, state.aqiA);
    const sB = calcActivityScore(act, state.weatherB, state.aqiB);
    const winA = sA >= sB, winB = sB >= sA;
    const pctA = sA, pctB = sB;
    return `<div class="act-cmp-item">
      <div class="aci-header">
        <span class="aci-icon">${act.icon}</span>
        <span class="aci-name">${act.label}</span>
        <span class="aci-badge">${winA ? nameA : nameB} 🏆</span>
      </div>
      <div class="aci-bars">
        <div class="aci-bar-row">
          <span class="aci-city">${nameA}</span>
          <div class="aci-bar-bg"><div class="aci-bar-fill ${winA ? 'winner' : ''}" style="width:${pctA}%"></div></div>
          <span class="aci-score">${sA}</span>
        </div>
        <div class="aci-bar-row">
          <span class="aci-city">${nameB}</span>
          <div class="aci-bar-bg"><div class="aci-bar-fill ${winB ? 'winner' : ''}" style="width:${pctB}%"></div></div>
          <span class="aci-score">${sB}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Smart Recommendations ──────────────────────────────────
function renderSmartRecs(scoreA, scoreB) {
  const nameA = state.cityA.name.split(',')[0];
  const nameB = state.cityB.name.split(',')[0];
  const cA = state.weatherA?.current || {};
  const cB = state.weatherB?.current || {};
  const aqiA = state.aqiA?.current?.aqi ?? 60;
  const aqiB = state.aqiB?.current?.aqi ?? 60;
  const winner = scoreA.total >= scoreB.total ? nameA : nameB;

  const recs = [];

  // Air quality
  const aqiDiff = Math.abs(aqiA - aqiB);
  if (aqiDiff > 15) {
    const better = aqiA < aqiB ? nameA : nameB;
    recs.push({ icon: '💨', text: `${better} currently offers significantly better air quality (AQI: ${Math.min(aqiA, aqiB)} vs ${Math.max(aqiA, aqiB)}).` });
  }

  // Temperature
  const tempA = cA.temp ?? 22, tempB = cB.temp ?? 22;
  const comfA = Math.abs(tempA - 22), comfB = Math.abs(tempB - 22);
  if (Math.abs(comfA - comfB) > 3) {
    const better = comfA < comfB ? nameA : nameB;
    recs.push({ icon: '🌡️', text: `${better} has more comfortable temperatures right now (${Math.round(tempA)}°C vs ${Math.round(tempB)}°C).` });
  }

  // UV
  const uvA = cA.uvIndex ?? 3, uvB = cB.uvIndex ?? 3;
  if (Math.abs(uvA - uvB) > 1) {
    const better = uvA < uvB ? nameA : nameB;
    recs.push({ icon: '☀️', text: `${better} has lower UV exposure (UV ${Math.min(uvA, uvB).toFixed(1)} vs ${Math.max(uvA, uvB).toFixed(1)}) — better for extended outdoor time.` });
  }

  // Outdoor exercise
  const runA = calcActivityScore(ACTIVITIES[1], state.weatherA, state.aqiA);
  const runB = calcActivityScore(ACTIVITIES[1], state.weatherB, state.aqiB);
  if (Math.abs(runA - runB) > 8) {
    const better = runA >= runB ? nameA : nameB;
    recs.push({ icon: '🏃', text: `${better} is recommended for outdoor exercise today (score: ${Math.max(runA, runB)}/100).` });
  }

  // Photography
  const photoA = calcActivityScore(ACTIVITIES[5], state.weatherA, state.aqiA);
  const photoB = calcActivityScore(ACTIVITIES[5], state.weatherB, state.aqiB);
  if (Math.abs(photoA - photoB) > 8) {
    const better = photoA >= photoB ? nameA : nameB;
    const betterCloud = better === nameA ? (cA.cloudCover ?? 0) : (cB.cloudCover ?? 0);
    const betterVis   = better === nameA ? (cA.visibility ?? 10) : (cB.visibility ?? 10);
    recs.push({ icon: '📷', text: `${better} provides better photography conditions with ${betterCloud}% cloud cover and ${betterVis.toFixed(1)} km visibility.` });
  }

  if (!recs.length) {
    recs.push({ icon: '≈', text: `Both cities have similar environmental conditions today. ${winner} has a slight edge overall with a CityScore™ of ${Math.max(scoreA.total, scoreB.total)}.` });
  }

  el('smart-recs-content').innerHTML = recs.map(r => `
    <div class="smart-rec-item">
      <span class="sri-icon">${r.icon}</span>
      <span class="sri-text">${r.text}</span>
    </div>
  `).join('');
}

// ── Charts ─────────────────────────────────────────────────
function renderCharts(scoreA, scoreB) {
  const nameA = state.cityA.name.split(',')[0];
  const nameB = state.cityB.name.split(',')[0];
  const compLabels = ['Air Quality', 'Temperature', 'Humidity', 'UV', 'Wind', 'Rain'];
  const dataA = [
    Math.round(scoreA.components.aqiScore),
    Math.round(scoreA.components.tempScore),
    Math.round(scoreA.components.humScore),
    Math.round(scoreA.components.uvScore),
    Math.round(scoreA.components.windScore),
    Math.round(scoreA.components.rainScore),
  ];
  const dataB = [
    Math.round(scoreB.components.aqiScore),
    Math.round(scoreB.components.tempScore),
    Math.round(scoreB.components.humScore),
    Math.round(scoreB.components.uvScore),
    Math.round(scoreB.components.windScore),
    Math.round(scoreB.components.rainScore),
  ];

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const tickColor = isDark ? '#8DA3C4' : '#64748b';

  // Destroy old charts
  if (state.radarChart) { state.radarChart.destroy(); state.radarChart = null; }
  if (state.barChart)   { state.barChart.destroy();   state.barChart = null; }

  // Radar chart
  const ctxR = el('chart-radar').getContext('2d');
  state.radarChart = new Chart(ctxR, {
    type: 'radar',
    data: {
      labels: compLabels,
      datasets: [
        { label: nameA, data: dataA, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.20)', borderWidth: 2, pointBackgroundColor: '#3b82f6' },
        { label: nameB, data: dataB, borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.20)', borderWidth: 2, pointBackgroundColor: '#a855f7' },
      ],
    },
    options: {
      responsive: true,
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, color: tickColor, backdropColor: 'transparent' }, grid: { color: gridColor }, pointLabels: { color: tickColor, font: { size: 12 } } } },
      plugins: { legend: { labels: { color: tickColor } } },
    },
  });

  // Bar chart
  const ctxB = el('chart-bar').getContext('2d');
  state.barChart = new Chart(ctxB, {
    type: 'bar',
    data: {
      labels: compLabels,
      datasets: [
        { label: nameA, data: dataA, backgroundColor: 'rgba(59,130,246,0.75)', borderRadius: 6 },
        { label: nameB, data: dataB, backgroundColor: 'rgba(168,85,247,0.75)', borderRadius: 6 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { min: 0, max: 100, ticks: { color: tickColor }, grid: { color: gridColor } },
      },
      plugins: { legend: { labels: { color: tickColor } } },
    },
  });
}

window.switchChart = mode => {
  el('chart-radar-wrap').style.display = mode === 'radar' ? '' : 'none';
  el('chart-bar-wrap').style.display   = mode === 'bar'   ? '' : 'none';
  document.querySelectorAll('.cmp-chart-tab[data-chart]').forEach(b => {
    b.classList.toggle('active', b.dataset.chart === mode);
  });
};

// ── Forecast Comparison ────────────────────────────────────
window.switchForecast = mode => {
  state.forecastMode = mode;
  renderForecast(mode);
  document.querySelectorAll('.cmp-chart-tab[data-fc]').forEach(b => {
    b.classList.toggle('active', b.dataset.fc === mode);
  });
};

function renderForecast(mode) {
  const nameA = state.cityA.name.split(',')[0];
  const nameB = state.cityB.name.split(',')[0];
  const wrap = el('forecast-cmp-content');

  if (mode === 'hourly') {
    // weatherA/B.hourly is an array of objects: [{time, temp, precipProb, ...}, ...]
    const hA = state.weatherA?.hourly, hB = state.weatherB?.hourly;
    if (!hA?.length || !hB?.length) { wrap.innerHTML = '<div class="page-subtitle" style="text-align:center;padding:16px">No forecast data</div>'; return; }

    const slots = Math.min(12, hA.length);
    let html = '<div class="fc-cmp-scroll"><div class="fc-cmp-grid">';
    html += `<div class="fch-header"><span>${nameA}</span><span>Time</span><span>${nameB}</span></div>`;
    for (let i = 0; i < slots; i++) {
      const t = hA[i]?.time ? new Date(hA[i].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–';
      const tA = Math.round(hA[i]?.temp ?? 0);
      const tB = Math.round(hB[i]?.temp ?? 0);
      const pA = hA[i]?.precipProb ?? 0;
      const pB = hB[i]?.precipProb ?? 0;
      const winT_A = tA >= tB;
      html += `<div class="fch-row">
        <div class="fch-city-a"><span class="fch-temp ${winT_A ? 'fch-win' : ''}">${tA}°</span><span class="fch-rain">${pA}% 🌧</span></div>
        <div class="fch-time">${t}</div>
        <div class="fch-city-b"><span class="fch-temp ${!winT_A ? 'fch-win' : ''}">${tB}°</span><span class="fch-rain">${pB}% 🌧</span></div>
      </div>`;
    }
    html += '</div></div>';
    wrap.innerHTML = html;
  } else {
    // weatherA/B.daily is an array of objects: [{date, tempMax, tempMin, precipProb, ...}, ...]
    const dA = state.weatherA?.daily, dB = state.weatherB?.daily;
    if (!dA?.length || !dB?.length) { wrap.innerHTML = '<div class="page-subtitle" style="text-align:center;padding:16px">No forecast data</div>'; return; }

    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const slots = Math.min(7, dA.length);
    let html = '<div class="fc-cmp-scroll"><div class="fc-cmp-grid">';
    html += `<div class="fch-header"><span>${nameA}</span><span>Day</span><span>${nameB}</span></div>`;
    for (let i = 0; i < slots; i++) {
      const d = dA[i]?.date ? days[new Date(dA[i].date).getDay()] : '–';
      const hiA = Math.round(dA[i]?.tempMax ?? 0);
      const loA = Math.round(dA[i]?.tempMin ?? 0);
      const hiB = Math.round(dB[i]?.tempMax ?? 0);
      const loB = Math.round(dB[i]?.tempMin ?? 0);
      const pA = dA[i]?.precipProb ?? 0;
      const pB = dB[i]?.precipProb ?? 0;
      html += `<div class="fch-row">
        <div class="fch-city-a"><span class="fch-temp">${hiA}°/${loA}°</span><span class="fch-rain">${pA}% 🌧</span></div>
        <div class="fch-time">${d}</div>
        <div class="fch-city-b"><span class="fch-temp">${hiB}°/${loB}°</span><span class="fch-rain">${pB}% 🌧</span></div>
      </div>`;
    }
    html += '</div></div>';
    wrap.innerHTML = html;
  }
}

// ── Radar Maps ─────────────────────────────────────────────
function renderMaps() {
  // Destroy old maps
  if (state.mapA) { state.mapA.remove(); state.mapA = null; }
  if (state.mapB) { state.mapB.remove(); state.mapB = null; }

  el('map-label-a').textContent = state.cityA.name.split(',')[0];
  el('map-label-b').textContent = state.cityB.name.split(',')[0];
  el('map-a').innerHTML = '';
  el('map-b').innerHTML = '';

  const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const tileAttr = '&copy; OSM &copy; CARTO';

  const mkMap = (divId, lat, lon) => {
    const m = L.map(divId, { zoomControl: false, attributionControl: false }).setView([lat, lon], 10);
    L.tileLayer(tileUrl, { attribution: tileAttr, subdomains: 'abcd', maxZoom: 18 }).addTo(m);
    L.marker([lat, lon]).addTo(m);
    setTimeout(() => m.invalidateSize(), 200);
    return m;
  };

  state.mapA = mkMap('map-a', state.cityA.lat, state.cityA.lon);
  state.mapB = mkMap('map-b', state.cityB.lat, state.cityB.lon);
}

// ── History ────────────────────────────────────────────────
function saveHistory() {
  let hist = getHistory();
  const entry = {
    nameA: state.cityA.name, latA: state.cityA.lat, lonA: state.cityA.lon,
    nameB: state.cityB.name, latB: state.cityB.lat, lonB: state.cityB.lon,
    ts: Date.now(),
  };
  // deduplicate
  hist = hist.filter(h => !(h.nameA === entry.nameA && h.nameB === entry.nameB));
  hist.unshift(entry);
  hist = hist.slice(0, MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hist));
  renderHistory();
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function renderHistory() {
  const hist = getHistory();
  const sec = el('recent-cmp-section');
  const list = el('recent-cmp-list');
  if (!hist.length) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  list.innerHTML = hist.map((h, i) => `
    <div class="recent-cmp-item" data-idx="${i}">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M9 3H4a1 1 0 00-1 1v16a1 1 0 001 1h5V3z"/><path stroke-linecap="round" d="M15 3h5a1 1 0 011 1v16a1 1 0 01-1 1h-5V3z"/><path stroke-linecap="round" d="M9 12h6"/></svg>
      <span>${h.nameA.split(',')[0]} vs ${h.nameB.split(',')[0]}</span>
    </div>
  `).join('');
  list.querySelectorAll('.recent-cmp-item').forEach(item => {
    item.addEventListener('click', () => {
      const h = hist[+item.dataset.idx];
      selectCity('a', { lat: h.latA, lon: h.lonA, name: h.nameA });
      selectCity('b', { lat: h.latB, lon: h.lonB, name: h.nameB });
      runCompare();
    });
  });
}

// ── Quick-compare chips ────────────────────────────────────
async function quickCompare(nameA, nameB) {
  // Geocode both city names and populate the slots
  const [resA, resB] = await Promise.all([geocode(nameA), geocode(nameB)]);
  if (!resA.length || !resB.length) return;
  const cityA = { lat: resA[0].latitude, lon: resA[0].longitude,
                  name: [resA[0].name, resA[0].country].filter(Boolean).join(', ') };
  const cityB = { lat: resB[0].latitude, lon: resB[0].longitude,
                  name: [resB[0].name, resB[0].country].filter(Boolean).join(', ') };
  selectCity('a', cityA);
  selectCity('b', cityB);
  setTimeout(runCompare, 80);
}

function setupQuickChips() {
  document.querySelectorAll('.quick-cmp-chip').forEach(btn => {
    btn.addEventListener('click', () => quickCompare(btn.dataset.a, btn.dataset.b));
  });
}

// ── Init ─────────────────────────────────────────────────────────
function init() {
  setupSearch('a');
  setupSearch('b');
  el('btn-compare').addEventListener('click', runCompare);
  setupQuickChips();
  renderHistory();

  const banner = el('offline-banner');
  window.addEventListener('offline', () => banner?.classList.add('show'));
  window.addEventListener('online',  () => banner?.classList.remove('show'));
  if (!navigator.onLine) banner?.classList.add('show');
}

document.addEventListener('DOMContentLoaded', init);
