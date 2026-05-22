import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { registerDevice, storeDeviceToken, addKnownDevice } from '../lib/api.js'

export default function SetupPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const deviceUrl = `${window.location.origin}/device/${id}`

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
    <div className="min-h-screen bg-[#111] flex flex-col items-center justify-start pt-10 pb-8 px-4 overflow-y-auto">
      <div className="w-full max-w-sm">
        {/* Eyebrow */}
        <p className="text-[#cc2200] text-xs font-semibold tracking-widest uppercase mb-2 text-center">
          Transit Keychain
        </p>

        {/* Heading */}
        <h1 className="text-white text-2xl font-bold text-center mb-1">
          Gerät einrichten
        </h1>

        {/* Device ID */}
        <p className="text-[#666] text-xs text-center mb-8 font-mono">
          {id.slice(0, 8)}...
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[#aaa] text-xs font-medium mb-1">
              Gerätename
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              required
              placeholder="z.B. Wohnzimmer Display"
              className="w-full bg-[#1a1a1a] border border-[#2e2e2e] text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-[#cc2200] transition-colors"
            />
          </div>

          {error && (
            <p className="text-[#cc2200] text-xs bg-[#cc220015] border border-[#cc220030] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg py-2.5 transition-colors"
          >
            {loading ? 'Einrichten...' : 'Weiter'}
          </button>
        </form>

        {/* QR Code */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-[#555] text-xs">Auf einem anderen Gerät öffnen</p>
          <div className="bg-white p-3 rounded-xl">
            <QRCodeSVG value={deviceUrl} size={110} />
          </div>
          <p className="text-[#444] text-[0.65rem] font-mono text-center break-all max-w-xs">
            {deviceUrl}
          </p>
        </div>
      </div>
    </div>
  )
}
