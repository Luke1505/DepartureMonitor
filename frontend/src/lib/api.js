const BASE_URL = import.meta.env.VITE_API_URL || ''

// --- Device token storage (per device, in localStorage) ---
export const getDeviceToken = (id) => localStorage.getItem(`dtok_${id}`) || ''
export const storeDeviceToken = (id, token) => localStorage.setItem(`dtok_${id}`, token.toUpperCase())
export const clearDeviceToken = (id) => localStorage.removeItem(`dtok_${id}`)

// --- Known devices (devices this browser has claimed) ---
const KNOWN_KEY = 'known_devices'
export const getKnownDeviceIds = () => JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]')
export const addKnownDevice = (id) => {
  const list = getKnownDeviceIds()
  if (!list.includes(id)) localStorage.setItem(KNOWN_KEY, JSON.stringify([...list, id]))
}
export const removeKnownDevice = (id) => {
  localStorage.setItem(KNOWN_KEY, JSON.stringify(getKnownDeviceIds().filter((d) => d !== id)))
}

function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  }).then(async (res) => {
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status, data: err })
    }
    return res.json()
  }).catch((err) => {
    clearTimeout(timeoutId);
    throw err;
  })
}

function requestAuth(path, id, options = {}) {
  return request(path, {
    ...options,
    headers: { ...options.headers, 'x-device-token': getDeviceToken(id) },
  })
}

// --- Device list (open) ---
export const listDevices = () => request('/api/device')

// --- Per-device (require token) ---
export const getDevice = (id) => requestAuth(`/api/device/${id}`, id)

export const deleteDevice = (id) =>
  requestAuth(`/api/device/${id}`, id, { method: 'DELETE' })

export const saveDeviceSettings = (id, settings) =>
  requestAuth(`/api/device/${id}`, id, { method: 'PATCH', body: JSON.stringify(settings) })

export const getWifi = (id) => requestAuth(`/api/device/${id}/wifi`, id)

export const addWifi = (id, body) =>
  requestAuth(`/api/device/${id}/wifi`, id, { method: 'POST', body: JSON.stringify(body) })

export const deleteWifi = (id, networkId) =>
  requestAuth(`/api/device/${id}/wifi/${networkId}`, id, { method: 'DELETE' })

export const getConfig = (id) => request(`/api/device/${id}/config`)

export const saveConfig = (id, config) =>
  requestAuth(`/api/device/${id}/config`, id, { method: 'POST', body: JSON.stringify(config) })

export const getConfigHistory = (id) => requestAuth(`/api/device/${id}/config/history`, id)

// --- Token management ---
export const requestTokenDisplay = (id) =>
  request(`/api/device/${id}/token/request`, { method: 'POST' })

export const regenerateToken = (id) =>
  requestAuth(`/api/device/${id}/token/regenerate`, id, { method: 'POST' })

// --- Device registration (open, called by firmware) ---
export const registerDevice = (id, body) =>
  request(`/api/device/${id}/register`, { method: 'POST', body: JSON.stringify(body) })

export const heartbeat = (id, data) =>
  request(`/api/device/${id}/heartbeat`, { method: 'POST', body: JSON.stringify(data) })

// --- Transit ---
export const getDepartures = (stopId, api, deviceId) =>
  request(`/api/transit/departures?stopId=${encodeURIComponent(stopId)}&api=${api}&deviceId=${deviceId || ''}`)

export const searchStops = (q, api) =>
  request(`/api/transit/stops?q=${encodeURIComponent(q)}&api=${api || 'vrr'}`)

export const getWeather = (lat, lon) =>
  request(`/api/transit/weather?lat=${lat}&lon=${lon}`)

export const getAnalytics = (id) => request(`/api/transit/analytics/${id}`)

// --- Firmware ---
export const getFirmwareLatest = (channel = 'stable') => request(`/api/firmware/latest?channel=${channel}`)
export const getFirmwareVersions = () => request('/api/firmware/versions')

export const triggerFlashBuild = (deviceId = null) =>
  request('/api/firmware/flash-build', { method: 'POST', body: JSON.stringify({ deviceId }) })

export const getFlashBuildStatus = (jobId) => request(`/api/firmware/flash-status/${jobId}`)
