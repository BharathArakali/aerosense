/* ============================================================
   AeroSense – weather.js
   Open-Meteo Weather API integration
   ============================================================ */

const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch full weather data from Open-Meteo
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object>} parsed weather object
 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      'temperature_2m',
      'apparent_temperature',
      'weather_code',
      'relative_humidity_2m',
      'wind_speed_10m',
      'wind_direction_10m',
      'pressure_msl',
      'visibility',
      'uv_index',
      'is_day',
      'precipitation',
      'cloud_cover',
    ].join(','),
    hourly: [
      'temperature_2m',
      'weather_code',
      'precipitation_probability',
      'apparent_temperature',
      'uv_index',
      'wind_speed_10m',
      'relative_humidity_2m',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'sunrise',
      'sunset',
      'uv_index_max',
      'wind_speed_10m_max',
    ].join(','),
    timezone: 'auto',
    forecast_days: 8,
    wind_speed_unit: 'kmh',
  });

  const res = await fetch(`${WEATHER_BASE}?${params}`);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const raw = await res.json();
  return parseWeather(raw);
}

function parseWeather(raw) {
  const c = raw.current;
  const h = raw.hourly;
  const d = raw.daily;

  // Current conditions
  const current = {
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    weatherCode: c.weather_code,
    humidity: c.relative_humidity_2m,
    windSpeed: Math.round(c.wind_speed_10m),
    windDir: c.wind_direction_10m,
    pressure: Math.round(c.pressure_msl),
    visibility: +(c.visibility / 1000).toFixed(1), // convert m → km
    uvIndex: Math.round(c.uv_index),
    isDay: c.is_day,
    precipitation: c.precipitation,
    cloudCover: c.cloud_cover,
    timestamp: Date.now(),
  };

  // Hourly (next 24 hours from current)
  const now = new Date(c.time);
  const nowHour = new Date(now);
  nowHour.setMinutes(0, 0, 0);
  const hourlyStart = h.time.findIndex(t => new Date(t) >= nowHour);
  const hourly = h.time.slice(hourlyStart, hourlyStart + 24).map((t, i) => ({
    time: t,
    temp: Math.round(h.temperature_2m[hourlyStart + i]),
    weatherCode: h.weather_code[hourlyStart + i],
    precipProb: h.precipitation_probability[hourlyStart + i] || 0,
    feelsLike: Math.round(h.apparent_temperature[hourlyStart + i]),
    uvIndex: Math.round(h.uv_index[hourlyStart + i] || 0),
    windSpeed: Math.round(h.wind_speed_10m[hourlyStart + i] || 0),
    humidity: h.relative_humidity_2m[hourlyStart + i] || 0,
  }));

  // Daily (7 days)
  const daily = d.time.slice(0, 8).map((t, i) => ({
    date: t,
    weatherCode: d.weather_code[i],
    tempMax: Math.round(d.temperature_2m_max[i]),
    tempMin: Math.round(d.temperature_2m_min[i]),
    precipProb: d.precipitation_probability_max[i] || 0,
    sunrise: d.sunrise[i],
    sunset: d.sunset[i],
    uvMax: Math.round(d.uv_index_max[i] || 0),
    windMax: Math.round(d.wind_speed_10m_max[i] || 0),
  }));

  return {
    current,
    hourly,
    daily,
    timezone: raw.timezone,
    lat: raw.latitude,
    lon: raw.longitude,
  };
}

/**
 * Estimate rain arrival based on hourly precipitation probability
 */
export function estimateRainArrival(hourly) {
  for (let i = 0; i < hourly.length; i++) {
    if (hourly[i].precipProb >= 40) {
      const hours = i;
      if (hours === 0) return 'Rain now';
      const h = Math.floor(hours);
      const m = Math.round((hours % 1) * 60);
      if (h === 0) return `Rain in ${m}m`;
      if (m === 0) return `Rain in ${h}h`;
      return `Rain in ${h}h ${m}m`;
    }
  }
  return 'No rain expected';
}

/**
 * Wind direction degrees → compass label
 */
export function windDirLabel(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}
