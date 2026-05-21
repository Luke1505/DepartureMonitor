import fetch from 'node-fetch';

const weatherCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

const WEATHER_CODE_MAP = {
  0: 'sun',
  1: 'cloud-sun',
  2: 'cloud-sun',
  3: 'cloud',
  45: 'cloud-fog',
  48: 'cloud-fog',
  51: 'cloud-drizzle',
  53: 'cloud-drizzle',
  55: 'cloud-drizzle',
  61: 'cloud-rain',
  63: 'cloud-rain',
  65: 'cloud-rain',
  71: 'cloud-snow',
  73: 'cloud-snow',
  75: 'cloud-snow',
  77: 'cloud-snow',
  80: 'cloud-rain',
  81: 'cloud-rain',
  82: 'cloud-rain',
  85: 'cloud-snow',
  86: 'cloud-snow',
  95: 'cloud-lightning',
  96: 'cloud-lightning',
  99: 'cloud-lightning',
};

export async function getWeather(lat, lon) {
  const cacheKey = `${lat}:${lon}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=Europe/Berlin`;

  const response = await fetch(url, { timeout: 10000 });
  if (!response.ok) throw new Error(`Open-Meteo responded with ${response.status}`);

  const json = await response.json();
  const current = json?.current || {};
  const temp = current.temperature_2m ?? null;
  const code = current.weather_code ?? 0;
  const is_day = current.is_day === 1;
  const icon = WEATHER_CODE_MAP[code] || 'cloud';

  const result = { temp, code, is_day, icon, fetchedAt: new Date().toISOString() };
  weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
