const listeners = new Set()

export function showToast(message, type = 'error') {
  listeners.forEach((fn) => fn({ message, type, id: Date.now() + Math.random() }))
}

export function subscribeToast(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
