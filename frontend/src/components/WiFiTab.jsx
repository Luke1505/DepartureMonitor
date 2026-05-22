import { useState, useEffect } from 'react'
import { X, Wifi } from 'lucide-react'
import { getWifi, addWifi, deleteWifi } from '../lib/api.js'
import { showToast } from '../lib/toast.js'

export default function WiFiTab({ deviceId, device }) {
  const [networks, setNetworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getWifi(deviceId)
      .then(setNetworks)
      .catch(() => showToast('Netzwerke konnten nicht geladen werden'))
      .finally(() => setLoading(false))
  }, [deviceId])

  async function handleAdd(e) {
    e.preventDefault()
    if (!ssid.trim() || !password.trim()) return
    setAdding(true)
    setError(null)
    try {
      const network = await addWifi(deviceId, { ssid: ssid.trim(), password: password.trim() })
      setNetworks((prev) => [...prev, network])
      setSsid('')
      setPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteWifi(deviceId, id)
      setNetworks((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      showToast(err.message || 'Netzwerk konnte nicht gelöscht werden')
    }
  }

  const inputCls = 'w-full bg-[#f8f8fa] dark:bg-[#222] border border-[#eeeeee] dark:border-[#2e2e2e] text-[#111] dark:text-[#e4e4e7] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#cc2200] transition-colors'
  const labelCls = 'block text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-1'

  return (
    <div className="space-y-3">
      {/* Saved Networks */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <p className={labelCls}>Gespeicherte Netzwerke</p>

        {loading ? (
          <p className="text-[#aaa] text-xs py-2">Laden...</p>
        ) : networks.length === 0 && !device?.ssid ? (
          <p className="text-[#aaa] dark:text-[#888] text-xs py-2">Keine Netzwerke gespeichert</p>
        ) : (
          <div className="space-y-1 mt-2">
            {device?.ssid && !networks.find((n) => n.ssid === device.ssid) && (
              <div className="flex items-center gap-2 py-1.5 border-b border-[#f0f0f0] dark:border-[#222]">
                <Wifi size={14} className="text-[#22c55e] flex-shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#111] dark:text-[#e4e4e7]">
                  {device.ssid}
                </span>
                <span className="text-[0.6rem] text-[#22c55e] font-medium">verbunden</span>
              </div>
            )}
            {networks.map((network) => (
              <div
                key={network.id}
                className="flex items-center gap-2 py-1.5 border-b border-[#f0f0f0] dark:border-[#222] last:border-0"
              >
                <Wifi size={14} className={`flex-shrink-0 ${network.ssid === device?.ssid ? 'text-[#22c55e]' : 'text-[#aaa] dark:text-[#888]'}`} />
                <span className="flex-1 text-xs font-medium text-[#111] dark:text-[#e4e4e7]">
                  {network.ssid}
                  {network.ssid === device?.ssid && (
                    <span className="ml-1.5 text-[0.6rem] text-[#22c55e] font-medium">verbunden</span>
                  )}
                </span>
                <button
                  onClick={() => handleDelete(network.id)}
                  className="text-[#aaa] hover:text-[#cc2200] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Network */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <p className={labelCls}>Netzwerk hinzufügen</p>
        <form onSubmit={handleAdd} className="space-y-3 mt-2">
          <div>
            <label className="block text-xs text-[#aaa] dark:text-[#888] mb-1">SSID</label>
            <input
              className={inputCls}
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="Netzwerkname"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs text-[#aaa] dark:text-[#888] mb-1">Passwort</label>
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p className="text-[#cc2200] text-xs">{error}</p>
          )}
          <button
            type="submit"
            disabled={adding || !ssid.trim() || !password.trim()}
            className="bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
          >
            {adding ? 'Wird hinzugefügt...' : '+ Hinzufügen'}
          </button>
        </form>
      </div>

      {/* Note */}
      <p className="text-[#aaa] dark:text-[#888] text-xs px-1">
        Gerät verbindet sich automatisch mit dem stärksten bekannten Netzwerk.
      </p>
    </div>
  )
}
