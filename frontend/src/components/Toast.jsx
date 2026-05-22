import { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { subscribeToast } from '../lib/toast.js'

const ICONS = {
  success: <CheckCircle size={15} />,
  error: <AlertCircle size={15} />,
  info: <Info size={15} />,
}

const COLORS = {
  success: 'bg-[#16a34a] text-white',
  error: 'bg-[#cc2200] text-white',
  info: 'bg-[#2563eb] text-white',
}

export default function Toast() {
  const [toasts, setToasts] = useState([])
  const [exiting, setExiting] = useState(new Set())

  const removeToast = useCallback((id) => {
    setExiting((s) => new Set([...s, id]))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      setExiting((s) => { const n = new Set(s); n.delete(id); return n })
    }, 180)
  }, [])

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts((prev) => [...prev, toast])
      setTimeout(() => removeToast(toast.id), 3800)
    })
  }, [removeToast])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-auto ${
            exiting.has(toast.id) ? 'animate-toast-out' : 'animate-toast-in'
          } ${COLORS[toast.type] || COLORS.error}`}
        >
          {ICONS[toast.type] || ICONS.error}
          <span className="flex-1 text-xs">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
