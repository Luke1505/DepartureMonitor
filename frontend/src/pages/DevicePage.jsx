import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getDevice, getConfig, saveConfig } from '../lib/api.js'
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

export default function DevicePage() {
  const { id } = useParams()
  const [device, setDevice] = useState(null)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [activeTab, setActiveTab] = useState('stations')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [dev, cfg] = await Promise.all([getDevice(id), getConfig(id)])
        setDevice(dev)
        if (cfg && cfg.status !== 'pending_setup') {
          setConfig(cfg)
        }
      } catch (err) {
        if (err.status !== 202) setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

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

      {/* Tab Bar */}
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

      {/* Tab Content */}
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
