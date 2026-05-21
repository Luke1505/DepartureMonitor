const BASE_URL = import.meta.env.VITE_API_URL || ''

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status, data: err })
  }
  return res.json()
}

export const getDevice = (id) => request(`/api/device/${id}`)

export const registerDevice = (id, body) =>
  request(`/api/device/${id}/register`, { method: 'POST', body: JSON.stringify(body) })

export const heartbeat = (id, data) =>
  request(`/api/device/${id}/heartbeat`, { method: 'POST', body: JSON.stringify(data) })

export const deleteDevice = (id) =>
  request(`/api/device/${id}`, { method: 'DELETE' })

export const getConfig = (id) => request(`/api/device/${id}/config`)

export const saveConfig = (id, config) =>
  request(`/api/device/${id}/config`, { method: 'POST', body: JSON.stringify(config) })

export const getConfigHistory = (id) => request(`/api/device/${id}/config/history`)

export const getWifi = (id) => request(`/api/device/${id}/wifi`)

export const addWifi = (id, body) =>
  request(`/api/device/${id}/wifi`, { method: 'POST', body: JSON.stringify(body) })

export const deleteWifi = (id, networkId) =>
  request(`/api/device/${id}/wifi/${networkId}`, { method: 'DELETE' })

export const getDepartures = (stopId, api, deviceId) =>
  request(`/api/transit/departures?stopId=${encodeURIComponent(stopId)}&api=${api}&deviceId=${deviceId || ''}`)

export const searchStops = (q, api) =>
  request(`/api/transit/stops?q=${encodeURIComponent(q)}&api=${api || 'vrr'}`)

export const getWeather = (lat, lon) =>
  request(`/api/transit/weather?lat=${lat}&lon=${lon}`)

export const getAnalytics = (id) => request(`/api/transit/analytics/${id}`)

export const getFirmwareLatest = () => request('/api/firmware/latest')

export const getFirmwareVersions = () => request('/api/firmware/versions')

export const saveDeviceSettings = (deviceId, settings) =>
  request(`/api/device/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
