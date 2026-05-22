import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, Zap } from 'lucide-react'
import { getFirmwareLatest, deleteDevice, saveDeviceSettings, regenerateToken, storeDeviceToken, getDeviceToken, clearDeviceToken, removeKnownDevice } from '../lib/api.js'
import { useNavigate, Link } from 'react-router-dom'
import { showToast } from '../lib/toast.js'

const inputCls = 'w-full bg-[#f8f8fa] dark:bg-[#222] border border-[#eeeeee] dark:border-[#2e2e2e] text-[#111] dark:text-[#e4e4e7] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#cc2200] transition-colors'
const labelCls = 'block text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-1'

function SettingsRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[#f0f0f0] dark:border-[#222] last:border-0">
      <label className="text-xs font-medium text-[#111] dark:text-[#e4e4e7] flex-shrink-0">{label}</label>
      {children}
    </div>
  )
}

export default function SettingsTab({ config, device, deviceId, onSave }) {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({
    refresh_minutes: config.refresh_minutes ?? 1,
    bat_warn_pct: config.bat_warn_pct ?? 20,
    timezone: config.timezone ?? 'Europe/Berlin',
    shutdown_minutes: config.shutdown_minutes ?? 30,
    ota_url: config.ota_url ?? '',
  })
  const [deviceSettings, setDeviceSettings] = useState({
    language: device?.language ?? 'de',
    display_type: device?.display_type ?? 'bwr',
  })

  const settingsInitialized = useRef(false)
  const deviceSettingsInitialized = useRef(false)
  const settingsTimer = useRef(null)
  const deviceSettingsTimer = useRef(null)

  // Auto-save config settings
  useEffect(() => {
    if (!settingsInitialized.current) {
      settingsInitialized.current = true
      return
    }
    clearTimeout(settingsTimer.current)
    settingsTimer.current = setTimeout(() => onSave(settings), 1500)
    return () => clearTimeout(settingsTimer.current)
  }, [settings])

  // Auto-save device settings
  useEffect(() => {
    if (!deviceSettingsInitialized.current) {
      deviceSettingsInitialized.current = true
      return
    }
    clearTimeout(deviceSettingsTimer.current)
    deviceSettingsTimer.current = setTimeout(() => {
      saveDeviceSettings(deviceId, deviceSettings).catch((err) => {
        console.error('Device settings auto-save failed:', err)
        showToast('Einstellungen konnten nicht gespeichert werden')
      })
    }, 1500)
    return () => clearTimeout(deviceSettingsTimer.current)
  }, [deviceSettings])

  const [firmwareInfo, setFirmwareInfo] = useState(null)
  const [checkingFw, setCheckingFw] = useState(false)
  const [fwProgress, setFwProgress] = useState(0)
  const [showQr, setShowQr] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [tokenFlash, setTokenFlash] = useState(null) // 'ok' | 'error'
  const currentToken = getDeviceToken(deviceId)

  function formatToken(t) {
    return t ? `${t.slice(0, 4)}-${t.slice(4)}` : '????????'
  }

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function updateDeviceSetting(key, value) {
    setDeviceSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function checkFirmware() {
    setCheckingFw(true)
    setFirmwareInfo(null)
    setFwProgress(0)
    try {
      const fw = await getFirmwareLatest()
      setFirmwareInfo(fw)
      // Simulate progress animation
      let p = 0
      const interval = setInterval(() => {
        p += 10
        setFwProgress(p)
        if (p >= 100) clearInterval(interval)
      }, 80)
    } catch (e) {
      setFirmwareInfo({ error: 'Kein Update verfügbar' })
    } finally {
      setCheckingFw(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    try {
      await deleteDevice(deviceId)
      clearDeviceToken(deviceId)
      removeKnownDevice(deviceId)
      navigate('/')
    } catch (e) {
      showToast('Gerät konnte nicht gelöscht werden')
      setResetting(false)
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(currentToken)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } catch {
      showToast('Kopieren fehlgeschlagen', 'error')
    }
  }

  async function handleRegenerateToken() {
    setRegenerating(true)
    setTokenFlash(null)
    try {
      const result = await regenerateToken(deviceId)
      storeDeviceToken(deviceId, result.access_token)
      setTokenFlash('ok')
      setTimeout(() => setTokenFlash(null), 3000)
    } catch {
      setTokenFlash('error')
    } finally {
      setRegenerating(false)
    }
  }

  const selectCls = inputCls + ' cursor-pointer'

  return (
    <div className="space-y-3">
      {/* General settings */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <p className={labelCls}>Allgemein</p>
        <div className="mt-2">
          <SettingsRow label="Sprache / Language">
            <select
              className={selectCls + ' w-40'}
              value={deviceSettings.language}
              onChange={(e) => updateDeviceSetting('language', e.target.value)}
            >
              <option value="de">Deutsch (DE)</option>
              <option value="en">English (EN)</option>
              <option value="fr">Français (FR)</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Display-Typ">
            <select
              className={selectCls + ' w-40'}
              value={deviceSettings.display_type}
              onChange={(e) => updateDeviceSetting('display_type', e.target.value)}
            >
              <option value="bwr">BWR (3-Farb E-Ink)</option>
              <option value="bw">BW (2-Farb E-Ink)</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Refresh-Intervall">
            <select
              className={selectCls + ' w-40'}
              value={settings.refresh_minutes}
              onChange={(e) => updateSetting('refresh_minutes', Number(e.target.value))}
            >
              <option value={1}>1 Minute</option>
              <option value={2}>2 Minuten</option>
              <option value={3}>3 Minuten</option>
              <option value={5}>5 Minuten</option>
              <option value={10}>10 Minuten</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Akkuwarnung ab">
            <select
              className={selectCls + ' w-40'}
              value={settings.bat_warn_pct}
              onChange={(e) => updateSetting('bat_warn_pct', Number(e.target.value))}
            >
              <option value={10}>10%</option>
              <option value={20}>20%</option>
              <option value={30}>30%</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Zeitzone">
            <select
              className={selectCls + ' w-40'}
              value={settings.timezone}
              onChange={(e) => updateSetting('timezone', e.target.value)}
            >
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="Europe/London">Europe/London</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Auto-Shutdown">
            <select
              className={selectCls + ' w-40'}
              value={settings.shutdown_minutes}
              onChange={(e) => updateSetting('shutdown_minutes', Number(e.target.value))}
            >
              <option value={30}>30 Minuten</option>
              <option value={60}>1 Stunde</option>
              <option value={120}>2 Stunden</option>
              <option value={0}>Nie</option>
            </select>
          </SettingsRow>
        </div>
      </div>

      {/* OTA Update */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <p className={labelCls}>OTA Update</p>
        <div className="space-y-2 mt-2">
          <div>
            <label className="block text-xs text-[#aaa] dark:text-[#888] mb-1">Update URL</label>
            <input
              className={inputCls}
              value={settings.ota_url}
              onChange={(e) => updateSetting('ota_url', e.target.value)}
              placeholder="https://..."
            />
          </div>
          <button
            onClick={checkFirmware}
            disabled={checkingFw}
            className="bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors active:scale-[0.98]"
          >
            {checkingFw ? 'Prüfe...' : 'Prüfen'}
          </button>
          <Link
            to={`/flash/${deviceId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#aaa] dark:text-[#888] hover:text-[#cc2200] transition-colors"
          >
            <Zap size={12} />
            Via USB flashen
          </Link>

          {firmwareInfo && (
            <div className="mt-2">
              {firmwareInfo.error ? (
                <p className="text-[#aaa] text-xs">{firmwareInfo.error}</p>
              ) : (
                <div>
                  <p className="text-xs font-medium text-[#111] dark:text-[#e4e4e7] mb-1">
                    Version {firmwareInfo.version} verfügbar
                  </p>
                  {fwProgress < 100 && (
                    <div className="w-full bg-[#f0f0f0] dark:bg-[#222] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[#cc2200] h-full rounded-full transition-all duration-100"
                        style={{ width: `${fwProgress}%` }}
                      />
                    </div>
                  )}
                  {firmwareInfo.changelog && (
                    <p className="text-xs text-[#aaa] mt-1">{firmwareInfo.changelog}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {device?.firmware && (
            <p className="text-[0.65rem] text-[#aaa] dark:text-[#888]">
              Aktuelle Firmware: <span className="font-mono">{device.firmware}</span>
            </p>
          )}
        </div>
      </div>

      {/* Config Backup */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <p className={labelCls}>Config Backup</p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setShowQr((s) => !s)}
            className="text-xs font-bold text-[#111] dark:text-[#e4e4e7] border border-[#eeeeee] dark:border-[#2e2e2e] px-3 py-1.5 rounded-lg hover:border-[#cc2200] hover:text-[#cc2200] transition-colors"
          >
            QR exportieren
          </button>
          <button
            className="text-xs font-bold text-[#aaa] dark:text-[#888] border border-[#eeeeee] dark:border-[#2e2e2e] px-3 py-1.5 rounded-lg opacity-60 cursor-not-allowed"
            disabled
          >
            QR importieren
          </button>
        </div>

        {showQr && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG
                value={JSON.stringify(config)}
                size={180}
                level="M"
              />
            </div>
            <p className="text-[0.6rem] text-[#aaa]">Config als QR Code</p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[#eeeeee] dark:border-[#2e2e2e] my-4" />

      {/* Access Token */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <p className={labelCls}>Zugriffscode</p>
        <p className="text-[0.68rem] text-[#aaa] dark:text-[#888] mt-1 mb-3">
          Dieser Code schützt den Zugriff auf dein Gerät. Gib ihn auf einem neuen Gerät ein, um Zugang zu erhalten.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 bg-[#f8f8fa] dark:bg-[#222] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-lg px-3 py-2 font-mono text-sm tracking-widest text-center text-[#111] dark:text-[#e4e4e7]">
            {tokenVisible ? formatToken(currentToken) : '????-????'}
          </div>
          <button
            onClick={() => setTokenVisible((v) => !v)}
            className="text-xs text-[#aaa] dark:text-[#888] border border-[#eeeeee] dark:border-[#2e2e2e] px-3 py-2 rounded-lg hover:border-[#cc2200] hover:text-[#cc2200] transition-colors"
          >
            {tokenVisible ? 'Verbergen' : 'Anzeigen'}
          </button>
          {tokenVisible && (
            <button
              onClick={copyToken}
              title="Kopieren"
              className="text-[#aaa] dark:text-[#888] border border-[#eeeeee] dark:border-[#2e2e2e] p-2 rounded-lg hover:border-[#cc2200] hover:text-[#cc2200] transition-colors"
            >
              {tokenCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>
        <button
          onClick={handleRegenerateToken}
          disabled={regenerating}
          className="text-xs font-bold text-[#cc2200] border-[1.5px] border-[#fecaca] dark:border-[#cc220040] px-4 py-2 rounded-lg hover:bg-[#cc220008] disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {regenerating ? 'Generiere...' : 'Neuen Code generieren'}
        </button>
        {tokenFlash === 'ok' && (
          <p className="text-[0.65rem] text-green-600 dark:text-green-400 mt-2">
            Neuer Code generiert. Bestehende Browser-Sitzungen werden abgemeldet.
          </p>
        )}
        {tokenFlash === 'error' && (
          <p className="text-[0.65rem] text-[#cc2200] mt-2">Fehler beim Generieren des Codes.</p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[#eeeeee] dark:border-[#2e2e2e] my-4" />

      {/* Factory Reset */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <p className={labelCls}>Gefahrenzone</p>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="mt-2 text-xs font-bold text-[#cc2200] border-[1.5px] border-[#fecaca] dark:border-[#cc220040] px-4 py-2 rounded-lg hover:bg-[#cc220008] transition-colors active:scale-[0.98]"
          >
            Factory Reset
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-[#cc2200] font-medium">
              Gerät wirklich löschen? Dies kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg active:scale-[0.98]"
              >
                {resetting ? 'Lösche...' : 'Ja, löschen'}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="text-xs font-bold text-[#aaa] border border-[#eeeeee] dark:border-[#2e2e2e] px-4 py-2 rounded-lg hover:text-[#111] dark:hover:text-[#e4e4e7] active:scale-[0.98]"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
