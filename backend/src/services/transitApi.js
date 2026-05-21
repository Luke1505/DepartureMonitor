import fetch from 'node-fetch';

const EFA_ENDPOINTS = {
  vrr: 'https://efa.vrr.de/vrr/',
  mvv: 'https://efa.mvv-muenchen.de/mvv/',
};

// In-memory cache: key -> { data, timestamp }
const departureCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function detectType(lineName = '') {
  if (/^U/i.test(lineName)) return 'U';
  if (/^S/i.test(lineName)) return 'S';
  if (/^T/i.test(lineName)) return 'T';
  if (/^(RE|RB|IC|EC)/i.test(lineName)) return 'R';
  return 'B';
}

function buildEfaBase(api) {
  return EFA_ENDPOINTS[api] || EFA_ENDPOINTS.vrr;
}

export async function getDepartures(stopId, api = 'vrr') {
  const cacheKey = `${api}:${stopId}`;
  const cached = departureCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const base = buildEfaBase(api);
  const url = `${base}XML_DM_REQUEST?outputFormat=JSON&type_dm=stopID&name_dm=${encodeURIComponent(stopId)}&mode=direct&useRealtime=1&limit=8`;

  const response = await fetch(url, { timeout: 10000 });
  if (!response.ok) throw new Error(`EFA responded with ${response.status}`);

  const json = await response.json();
  const rawDepartures = json?.dm?.departureList || json?.departureList || [];

  const departures = rawDepartures.map((item) => {
    const line = item?.servingLine?.number || item?.servingLine?.name || '';
    const destination = item?.servingLine?.direction || item?.servingLine?.dest || '';
    const platform = item?.stopSeqCoords?.[0]?.platform || item?.platform || '';
    const countdown = parseInt(item?.countdown ?? item?.timeToReach ?? 0, 10);
    const delay = parseInt(item?.servingLine?.delayPrediction ?? item?.realtime?.delay ?? 0, 10);
    const type = detectType(line);

    return { line, destination, platform: String(platform), countdown, delay, type };
  });

  const result = { departures, fetchedAt: new Date().toISOString() };
  departureCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

const stopCache = new Map();
const STOP_CACHE_TTL_MS = 5 * 60 * 1000;

export async function searchStops(q, api = 'vrr') {
  const cacheKey = `stops:${api}:${q}`;
  const cached = stopCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < STOP_CACHE_TTL_MS) {
    return cached.data;
  }

  const base = buildEfaBase(api);
  const url = `${base}XML_STOPFINDER_REQUEST?outputFormat=JSON&type_sf=any&name_sf=${encodeURIComponent(q)}&anyObjFilter_sf=2`;

  const response = await fetch(url, { timeout: 10000 });
  if (!response.ok) throw new Error(`EFA stop search responded with ${response.status}`);

  const json = await response.json();
  const points = json?.stopFinder?.points || json?.points || [];
  const pointList = Array.isArray(points) ? points : [points];

  const stops = pointList
    .filter((p) => p?.type === 'stop' || p?.anyType === 'stop' || p?.object)
    .map((p) => ({
      id: p?.stateless || p?.id || p?.name,
      name: p?.name || p?.object || '',
      city: p?.ref?.place || p?.locality || '',
    }));

  stopCache.set(cacheKey, { data: stops, timestamp: Date.now() });
  return stops;
}
