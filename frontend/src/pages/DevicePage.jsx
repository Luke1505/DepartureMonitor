import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, RefreshCw, MonitorSmartphone } from 'lucide-react'
import { getDevice, getConfig, saveConfig, requestTokenDisplay, getDeviceToken, storeDeviceToken } from '../lib/api.js'
import DeviceHeader from '../components/DeviceHeader.jsx'
import StationsTab from '../components/StationsTab.jsx'
import WiFiTab from '../components/WiFiTab.jsx'
import ApisTab from '../components/ApisTab.jsx'
import SettingsTab from '../components/SettingsTab.jsx'

const TABS = [
  { id: 'stations', label: 'Haltestellen' },
  { id: 'wifi', label: 'WLAN' },
  { id: 'apis', label: 'APIs' },
  { id: 'settings', label: 'Einstellungen' },
]

const DEFAULT_CONFIG = {
  stations: [],
  apis: {
    db: { clientId: '', clientSecret: '' },
    hvv: { apiKey: '', endpoint: 'https://api.geofox.de/gti/public/' },
    custom: [],
  },
  refresh_minutes: 3,
  timezone: 'Europe/Berlin',
  shutdown_minutes: 30,
  bat_warn_pct: 20,
  ota_url: '',
}

function formatToken(token) {
  const t = token.replace(/-/g, '').toUpperCase()
  return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4)}` : t
}

function UnlockScreen({ deviceId, onUnlocked }) {
  const [tokenInput, setTokenInput] = useState('')
  const [requested, setRequested] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  async function handleRequest() {
    setRequesting(true)
    setError(null)
    try {
      await requestTokenDisplay(deviceId)
      setRequested(true)
    } catch {
      setError('Gerät nicht erreichbar.')
    } finally {
      setRequesting(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const code = tokenInput.replace(/-/g, '').toUpperCase().trim()
    if (code.length !== 8) {
      setError('Code muss 8 Zeichen lang sein (z.B. A3B4-C5D6)')
      return
    }
    setChecking(true)
    setError(null)
    const prevToken = getDeviceToken(deviceId)
    storeDeviceToken(deviceId, code)
    try {
      const dev = await getDevice(deviceId)
      onUnlocked(dev)
    } catch (err) {
      storeDeviceToken(deviceId, prevToken)  // rollback on failure
      if (err.status === 401) {
        setError('Falscher Code. Bitte prüfe die Eingabe.')
      } else {
        setError(err.message)
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex items-center justify-center p-4">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-[#cc220015] flex items-center justify-center">
              <KeyRound size={22} className="text-[#cc2200]" />
            </div>
          </div>
          <h2 className="text-[#111] dark:text-[#e4e4e7] text-base font-bold">Zugriffscode eingeben</h2>
          <p className="text-[#aaa] dark:text-[#888] text-xs leading-relaxed">
            Lass den 8-stelligen Code auf deinem Gerät anzeigen und gib ihn hier ein.
          </p>
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4 space-y-3">
          <div>
            <p className="text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-2">
              Schritt 1 — Code anfordern
            </p>
            <button
              onClick={handleRequest}
              disabled={requesting || requested}
              className="w-full flex items-center justify-center gap-2 bg-[#f8f8fa] dark:bg-[#222] border border-[#eeeeee] dark:border-[#2e2e2e] text-[#111] dark:text-[#e4e4e7] text-xs font-semibold px-4 py-2.5 rounded-lg hover:border-[#cc2200] hover:text-[#cc2200] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <MonitorSmartphone size={14} />
              {requested ? '✓ Code wird angezeigt (60s)' : requesting ? 'Sende...' : 'Code auf Gerät anzeigen'}
            </button>
            {requested && (
              <p className="text-[0.65rem] text-[#aaa] dark:text-[#888] mt-1.5 text-center">
                Schau auf dein Gerät — es zeigt gleich den Code an.
              </p>
            )}
          </div>

          <div className="border-t border-[#f0f0f0] dark:border-[#222] pt-3">
            <p className="text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-2">
              Schritt 2 — Code eingeben
            </p>
            <form onSubmit={handleSubmit} className="space-y-2">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^a-fA-F0-9-]/g, '')
                  setTokenInput(raw.toUpperCase())
                  setError(null)
                }}
                placeholder="A3B4-C5D6"
                maxLength={9}
                spellCheck={false}
                className="w-full text-center bg-[#f8f8fa] dark:bg-[#222] border-[1.5px] border-[#eeeeee] dark:border-[#2e2e2e] text-[#111] dark:text-[#e4e4e7] rounded-lg px-3 py-2 text-sm font-mono tracking-widest outline-none focus:border-[#cc2200] transition-colors"
              />
              {error && <p className="text-[0.65rem] text-[#cc2200] text-center">{error}</p>}
              <button
                type="submit"
                disabled={checking || tokenInput.replace(/-/g, '').length < 8}
                className="w-full bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
              >
                {checking ? 'Prüfe...' : 'Entsperren'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DevicePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [device, setDevice] = useState(null)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [activeTab, setActiveTab] = useState('stations')
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)

  // If URL contains ?token=... cache it and redirect cleanly
  useEffect(() => {
    const urlToken = searchParams.get('token')
    if (urlToken) {
      storeDeviceToken(id, urlToken)
      navigate(`/device/${id}`, { replace: true })
    }
  }, [id, searchParams, navigate])

  const load = useCallback(async () => {
    if (searchParams.get('token')) return // wait for redirect
    setLoading(true)
    setError(null)
    try {
      const [dev, cfg] = await Promise.all([getDevice(id), getConfig(id)])
      setDevice(dev)
      if (cfg && cfg.status !== 'pending_setup') setConfig(cfg)
      setLocked(false)
    } catch (err) {
      if (err.status === 401) {
        setLocked(true)
      } else if (err.status !== 202) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [id, searchParams])

  useEffect(() => { load() }, [load])

  async function handleSave(newConfig) {
    const merged = { ...config, ...newConfig }
    setConfig(merged)
    try {
      await saveConfig(id, merged)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      console.error('Save failed:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex items-center justify-center">
        <div className="text-[#aaa] dark:text-[#888] text-sm">Loading...</div>
      </div>
    )
  }

  if (locked) {
    return <UnlockScreen deviceId={id} onUnlocked={(dev) => { setDevice(dev); setLocked(false); load() }} />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-[#cc2200] text-sm font-medium mb-2">Error</p>
          <p className="text-[#aaa] text-xs">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111]">
      <DeviceHeader device={device} deviceId={id} flash={savedFlash} onDeviceUpdate={setDevice} />

      <div className="sticky top-[56px] z-10 bg-[#f0f2f5] dark:bg-[#111] border-b border-[#eeeeee] dark:border-[#2e2e2e]">
        <div className="max-w-2xl mx-auto px-4 flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-[#cc2200] border-[#cc2200]'
                  : 'text-[#aaa] dark:text-[#888] border-transparent hover:text-[#111] dark:hover:text-[#e4e4e7]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {activeTab === 'stations' && (
          <StationsTab config={config} deviceId={id} onSave={handleSave} />
        )}
        {activeTab === 'wifi' && <WiFiTab deviceId={id} device={device} />}
        {activeTab === 'apis' && (
          <ApisTab config={config} deviceId={id} onSave={handleSave} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab config={config} device={device} deviceId={id} onSave={handleSave} />
        )}
      </div>
    </div>
  )
}
