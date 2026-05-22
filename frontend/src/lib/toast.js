const listeners = new Set()
const recentMessages = new Map()
const DEDUPE_MS = 1500

export function showToast(message, type = 'error') {
  const key = `${type}:${message}`
  if (recentMessages.has(key)) return
  recentMessages.set(key, true)
  setTimeout(() => recentMessages.delete(key), DEDUPE_MS)
  listeners.forEach((fn) => fn({ message, type, id: Date.now() + Math.random() }))
}

showToast.success = (message) => showToast(message, 'success')
showToast.info = (message) => showToast(message, 'info')
showToast.error = (message) => showToast(message, 'error')

export function subscribeToast(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
