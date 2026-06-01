/* ============================================================
   AeroSense – aqi.js
   Open-Meteo Air Quality API integration
   ============================================================ */

const AQI_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/**
 * Fetch AQI and pollutant data
 */
export async function fetchAQI(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      'us_aqi',
      'pm2_5',
      'pm10',
      'ozone',
      'nitrogen_dioxide',
      'carbon_monoxide',
      'european_aqi',
    ].join(','),
    hourly: [
      'us_aqi',
      'pm2_5',
      'pm10',
    ].join(','),
    timezone: 'auto',
    forecast_days: 7,
  });

  const res = await fetch(`${AQI_BASE}?${params}`);
  if (!res.ok) throw new Error(`AQI API error: ${res.status}`);
  const raw = await res.json();
  return parseAQI(raw);
}

function parseAQI(raw) {
  const c = raw.current;
  const h = raw.hourly;

  const current = {
    aqi: Math.round(c.us_aqi || 0),
    pm25: +(c.pm2_5 || 0).toFixed(1),
    pm10: +(c.pm10 || 0).toFixed(1),
    ozone: +(c.ozone || 0).toFixed(0),
    no2: +(c.nitrogen_dioxide || 0).toFixed(1),
    co: +((c.carbon_monoxide || 0) / 1000).toFixed(3), // ppb → ppm approx
    europeanAqi: Math.round(c.european_aqi || 0),
    timestamp: Date.now(),
  };

  // Hourly AQI trend (next 24h)
  const hourlyAqi = (h.us_aqi || []).slice(0, 24).map((v, i) => ({
    time: h.time[i],
    aqi: Math.round(v || 0),
    pm25: +(h.pm2_5?.[i] || 0).toFixed(1),
    pm10: +(h.pm10?.[i] || 0).toFixed(1),
  }));

  // 7-day daily average from hourly
  const daily7 = [];
  for (let d = 0; d < 7; d++) {
    const slice = (h.us_aqi || []).slice(d * 24, (d + 1) * 24).filter(Boolean);
    const avg = slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : 0;
    daily7.push({ day: d, avg });
  }

  return { current, hourlyAqi, daily7 };
}

/**
 * Health advisory text based on AQI
 */
export function getHealthAdvisory(aqi) {
  if (aqi <= 50) return {
    level: 'Good',
    color: '#22c55e',
    bgColor: 'rgba(34,197,94,.08)',
    text: 'Air quality is satisfactory. Enjoy outdoor activities!'
  };
  if (aqi <= 100) return {
    level: 'Moderate',
    color: '#eab308',
    bgColor: 'rgba(234,179,8,.08)',
    text: 'AQI is moderate. Sensitive individuals should limit prolonged outdoor exertion.'
  };
  if (aqi <= 150) return {
    level: 'Unhealthy for Sensitive',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,.08)',
    text: 'People with heart/lung disease, older adults, and children should reduce prolonged outdoor exertion.'
  };
  if (aqi <= 200) return {
    level: 'Unhealthy',
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,.08)',
    text: 'Everyone may experience health effects. Sensitive groups should avoid outdoor exertion.'
  };
  if (aqi <= 300) return {
    level: 'Very Unhealthy',
    color: '#9333ea',
    bgColor: 'rgba(147,51,234,.08)',
    text: 'Health warnings of emergency conditions. Everyone should avoid outdoor activities.'
  };
  return {
    level: 'Hazardous',
    color: '#7f1d1d',
    bgColor: 'rgba(127,29,29,.15)',
    text: 'Serious health effects for everyone. Avoid all outdoor activities, stay indoors.'
  };
}
