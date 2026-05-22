import { useState, useEffect } from 'react'
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

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts((prev) => [...prev, toast])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 4000)
    })
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-in ${COLORS[toast.type] || COLORS.error}`}
        >
          {ICONS[toast.type] || ICONS.error}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
