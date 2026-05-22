import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Sun, Moon, ArrowLeft } from 'lucide-react'
import { registerDevice, storeDeviceToken, addKnownDevice } from '../lib/api.js'
import { useDarkMode } from '../App.jsx'

export default function SetupPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { darkMode, toggleDarkMode } = useDarkMode()
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const deviceUrl = `${window.location.origin}/device/${id}`

  useEffect(() => { document.title = 'Gerät einrichten — Transit' }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await registerDevice(id, { name: name.trim() })
      if (data.access_token) {
        storeDeviceToken(id, data.access_token)
        addKnownDevice(id)
      }
      navigate(`/device/${id}`)
    } catch (err) {
      setError(err.message || 'Registrierung fehlgeschlagen')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex flex-col">
      {/* Nav */}
      <div className="flex items-center justify-between px-5 pt-4 pb-0 flex-shrink-0">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-[#aaa] dark:text-[#888] hover:text-[#111] dark:hover:text-[#e4e4e7] transition-colors text-xs"
        >
          <ArrowLeft size={14} />
          Zurück
        </Link>
        <button
          onClick={toggleDarkMode}
          className="p-1.5 rounded-lg text-[#aaa] dark:text-[#888] hover:text-[#111] dark:hover:text-[#e4e4e7] hover:bg-white dark:hover:bg-[#222] transition-colors hover:scale-110 duration-200"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 animate-fade-in-up">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <span className="w-3 h-3 rounded-full bg-[#cc2200]" />
            </div>
            <p className="text-[#cc2200] text-xs font-semibold tracking-widest uppercase mb-2">
              Transit
            </p>
            <h1 className="text-[#111] dark:text-[#e4e4e7] text-2xl font-bold mb-1">
              Gerät einrichten
            </h1>
            <p className="text-[#aaa] dark:text-[#888] text-xs font-mono">
              {id.slice(0, 8)}...
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-5 space-y-4">
            <div>
              <label className="block text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-1.5">
                Gerätename
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e) }}
                placeholder="z.B. Wohnzimmer Display"
                className="w-full bg-[#f8f8fa] dark:bg-[#222] border border-[#eeeeee] dark:border-[#2e2e2e] text-[#111] dark:text-[#e4e4e7] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#cc2200] transition-colors placeholder:text-[#ccc] dark:placeholder:text-[#555]"
              />
            </div>

            {error && (
              <p className="text-[#cc2200] text-xs bg-[#cc220010] border border-[#cc220025] rounded-lg px-3 py-2 animate-fade-in">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !name.trim()}
              className="w-full bg-[#cc2200] hover:bg-[#aa1800] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg py-2.5 transition-all text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Einrichten...
                </span>
              ) : 'Einrichten'}
            </button>
          </div>

          {/* QR Code */}
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-[#aaa] dark:text-[#888] text-xs">Auf einem anderen Gerät öffnen</p>
            <div className="bg-white p-3 rounded-xl shadow-sm">
              <QRCodeSVG value={deviceUrl} size={110} />
            </div>
            <p className="text-[#ccc] dark:text-[#555] text-[0.62rem] font-mono text-center break-all max-w-xs">
              {deviceUrl}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
