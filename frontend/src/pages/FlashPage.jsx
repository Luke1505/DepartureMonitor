import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle, AlertTriangle, Zap, Usb, Shield, Download, Moon, Sun } from 'lucide-react'
import { getDevice, getConfig, getFirmwareLatest } from '../lib/api.js'
import { useDarkMode } from '../App.jsx'

const MANIFEST_URL = (channel) => `/api/firmware/manifest/${channel}`

function compareVersions(a, b) {
  // Returns true if b > a (b is newer than a)
  if (!a || !b) return false
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (nb > na) return true
    if (nb < na) return false
  }
  return false
}

function StepBadge({ n, done, active }) {
  if (done) return (
    <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
      <CheckCircle size={14} className="text-white" />
    </span>
  )
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border-2 ${
      active
        ? 'border-[#cc2200] text-[#cc2200]'
        : 'border-[#444] text-[#666]'
    }`}>{n}</span>
  )
}

export default function FlashPage() {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  const { darkMode, toggleDarkMode } = useDarkMode()

  const [channel, setChannel] = useState('stable')
  const [firmware, setFirmware] = useState(null)
  const [firmwareLoading, setFirmwareLoading] = useState(true)
  const [firmwareError, setFirmwareError] = useState(null)

  const [device, setDevice] = useState(null)
  const [deviceConfig, setDeviceConfig] = useState(null)
  const [deviceLoading, setDeviceLoading] = useState(!!deviceId)

  // Step 1 state
  const [backupDone, setBackupDone] = useState(!deviceId) // skip if no device
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupConfig, setBackupConfig] = useState(null)

  // Flash state
  const [flashState, setFlashState] = useState('idle') // idle | flashing | success | error
  const [flashError, setFlashError] = useState(null)
  const [postFlashCountdown, setPostFlashCountdown] = useState(5)

  const espButtonRef = useRef(null)
  const webSerialSupported = 'serial' in navigator

  // Load firmware manifest info
  useEffect(() => {
    setFirmwareLoading(true)
    setFirmwareError(null)
    getFirmwareLatest()
      .then(setFirmware)
      .catch((e) => setFirmwareError(e.message))
      .finally(() => setFirmwareLoading(false))
  }, [channel])

  // Load device info if deviceId present
  useEffect(() => {
    if (!deviceId) return
    Promise.all([getDevice(deviceId), getConfig(deviceId)])
      .then(([dev, cfg]) => {
        setDevice(dev)
        if (cfg && cfg.status !== 'pending_setup') setDeviceConfig(cfg)
      })
      .catch(console.error)
      .finally(() => setDeviceLoading(false))
  }, [deviceId])

  // Load esp-web-tools script
  useEffect(() => {
    if (!webSerialSupported) return
    const existing = document.querySelector('script[data-esp-web-tools]')
    if (existing) return
    const script = document.createElement('script')
    script.type = 'module'
    script.src = 'https://unpkg.com/esp-web-tools@10/dist/web/install-button.js'
    script.setAttribute('data-esp-web-tools', '1')
    document.head.appendChild(script)
  }, [webSerialSupported])

  // Attach esp-web-tools event listeners
  useEffect(() => {
    const el = espButtonRef.current
    if (!el) return

    function onStateChanged(e) {
      const state = e.detail?.state
      if (state === 'installing') setFlashState('flashing')
      if (state === 'finished') setFlashState('success')
    }
    function onError(e) {
      setFlashError(e.detail?.message || 'Flash failed')
      setFlashState('error')
    }

    el.addEventListener('state-changed', onStateChanged)
    el.addEventListener('error', onError)
    return () => {
      el.removeEventListener('state-changed', onStateChanged)
      el.removeEventListener('error', onError)
    }
  })

  // Post-flash countdown redirect
  useEffect(() => {
    if (flashState !== 'success' || !deviceId) return
    if (postFlashCountdown <= 0) {
      navigate(`/device/${deviceId}`)
      return
    }
    const t = setTimeout(() => setPostFlashCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [flashState, postFlashCountdown, deviceId, navigate])

  async function handleBackup() {
    if (!deviceId || !deviceConfig) {
      setBackupDone(true)
      return
    }
    setBackupLoading(true)
    try {
      setBackupConfig(deviceConfig)
      setBackupDone(true)
    } catch (e) {
      console.error(e)
    } finally {
      setBackupLoading(false)
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(backupConfig, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `config-${deviceId || 'backup'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isOutdated = device?.firmware && firmware?.version
    ? compareVersions(device.firmware, firmware.version)
    : false

  const cardCls = 'bg-[#1a1a1a] border border-[#2e2e2e] rounded-[14px] p-5'
  const labelCls = 'block text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#555] mb-1'

  return (
    <div className="min-h-screen bg-[#111] text-[#e4e4e7]">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-[#1a1a1a] border-b border-[#2e2e2e] h-14 flex items-center px-4 gap-3">
        <span className="w-2 h-2 rounded-full bg-[#cc2200] flex-shrink-0" />
        <span className="text-sm font-semibold flex-1">Transit Keychain</span>
        {deviceId && (
          <Link
            to={`/device/${deviceId}`}
            className="text-xs text-[#888] hover:text-[#e4e4e7] transition-colors"
          >
            ← Back to device
          </Link>
        )}
        <button
          onClick={toggleDarkMode}
          className="p-1.5 rounded-lg text-[#888] hover:text-[#e4e4e7] hover:bg-[#222] transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Header card */}
        <div className={cardCls}>
          <div className="flex items-start gap-3">
            <Zap size={24} className="text-[#cc2200] flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold text-white">Flash Firmware</h1>
              <p className="text-xs text-[#888] mt-0.5">
                Connect your DepartureMonitor via USB-C to flash
              </p>
            </div>
          </div>

          {/* Channel toggle */}
          <div className="flex gap-2 mt-4">
            {['stable', 'beta'].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${
                  channel === ch
                    ? 'bg-[#cc2200] text-white'
                    : 'bg-[#222] text-[#888] hover:text-[#e4e4e7]'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Firmware info card */}
        <div className={cardCls}>
          <p className={labelCls}>Firmware</p>
          {firmwareLoading ? (
            <p className="text-xs text-[#888]">Laden...</p>
          ) : firmwareError ? (
            <p className="text-xs text-[#cc2200]">Kein Firmware verfügbar für {channel}</p>
          ) : firmware ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold font-mono">{firmware.version}</span>
                <span className="text-[0.6rem] font-bold bg-[#cc220020] text-[#cc2200] px-2 py-0.5 rounded-full capitalize">
                  {channel}
                </span>
              </div>
              {firmware.created_at && (
                <p className="text-[0.65rem] text-[#888]">
                  {new Date(firmware.created_at).toLocaleDateString('de-DE', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </p>
              )}
              {firmware.changelog && (
                <ul className="mt-2 space-y-1">
                  {firmware.changelog.split('\n').filter(Boolean).map((line, i) => (
                    <li key={i} className="text-xs text-[#aaa] flex gap-2">
                      <span className="text-[#cc2200] flex-shrink-0">•</span>
                      {line.replace(/^[-•]\s*/, '')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {/* Device card (if deviceId) */}
        {deviceId && (
          <div className={cardCls}>
            <p className={labelCls}>Gerät</p>
            {deviceLoading ? (
              <p className="text-xs text-[#888]">Laden...</p>
            ) : device ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm">{device.name || 'Unbenannt'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#888]">Aktuelle Firmware:</span>
                  <span className="font-mono text-[#aaa]">{device.firmware || 'unbekannt'}</span>
                  {isOutdated && (
                    <span className="text-[0.6rem] font-bold bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                      (old)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2 text-[0.65rem] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} className="flex-shrink-0" />
                  Config wird automatisch gesichert vor dem Flash
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#888]">Gerät nicht gefunden</p>
            )}
          </div>
        )}

        {/* Browser compatibility warning */}
        {!webSerialSupported && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-[14px] p-4 flex gap-3 items-start">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Browser nicht unterstützt</p>
              <p className="text-xs text-red-400/80 mt-1">
                Web flashing requires Chrome or Edge. Web Serial is not supported in Firefox or Safari.
              </p>
            </div>
          </div>
        )}

        {/* Steps card */}
        {webSerialSupported && (
          <div className={cardCls + ' space-y-5'}>
            <p className={labelCls}>Schritte</p>

            {/* Step 1: Backup */}
            <div className="flex gap-3">
              <StepBadge n={1} done={backupDone} active={!backupDone} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${backupDone ? 'text-[#888]' : 'text-white'}`}>
                  Config sichern
                </p>
                {!deviceId ? (
                  <p className="text-xs text-[#888] mt-0.5">
                    Kein Gerät verknüpft — Schritt wird übersprungen.
                  </p>
                ) : backupDone ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-green-400 font-medium flex items-center gap-1">
                      <CheckCircle size={13} /> Config backed up ✓
                    </p>
                    {backupConfig && (
                      <>
                        <div className="bg-white inline-block p-2 rounded-lg">
                          <QRCodeSVG value={JSON.stringify(backupConfig)} size={120} level="M" />
                        </div>
                        <button
                          onClick={downloadJson}
                          className="flex items-center gap-1.5 text-xs text-[#cc2200] hover:text-[#aa1800] font-medium"
                        >
                          <Download size={13} /> Download JSON
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    <button
                      onClick={handleBackup}
                      disabled={backupLoading}
                      className="bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors"
                    >
                      {backupLoading ? 'Sichern...' : 'Config sichern'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Connect USB */}
            <div className="flex gap-3">
              <StepBadge n={2} done={false} active={backupDone} />
              <div className="flex-1">
                <p className={`text-sm font-semibold ${backupDone ? 'text-white' : 'text-[#666]'}`}>
                  USB-C verbinden
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Usb size={14} className={backupDone ? 'text-[#cc2200]' : 'text-[#444]'} />
                  <p className={`text-xs ${backupDone ? 'text-[#aaa]' : 'text-[#555]'}`}>
                    Verbinde das Gerät per USB-C mit diesem Computer
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: Flash */}
            <div className="flex gap-3">
              <StepBadge n={3} done={flashState === 'success'} active={backupDone} />
              <div className="flex-1">
                <p className={`text-sm font-semibold ${backupDone ? 'text-white' : 'text-[#666]'}`}>
                  Firmware flashen
                </p>
                <div className="mt-2">
                  {flashState === 'success' ? (
                    <div className="space-y-2">
                      <p className="text-green-400 font-bold text-sm flex items-center gap-2">
                        <CheckCircle size={16} /> Flash complete! 🎉
                      </p>
                      {deviceId ? (
                        <p className="text-xs text-[#888]">
                          Redirecting to config in {postFlashCountdown}s...
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-[#888]">Scanne den QR Code für die Einrichtung:</p>
                          <div className="bg-white inline-block p-2 rounded-lg">
                            <QRCodeSVG
                              value={`${window.location.origin}/setup/${crypto.randomUUID()}`}
                              size={140}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : flashState === 'error' ? (
                    <div className="text-xs text-[#cc2200] bg-[#cc220015] border border-[#cc220030] rounded-lg px-3 py-2">
                      <p className="font-semibold">Flash fehlgeschlagen</p>
                      <p className="mt-0.5 text-[#cc2200]/80">{flashError}</p>
                      <button
                        className="mt-2 text-[#cc2200] underline"
                        onClick={() => setFlashState('idle')}
                      >
                        Erneut versuchen
                      </button>
                    </div>
                  ) : flashState === 'flashing' ? (
                    <div className="flex items-center gap-2 text-xs text-[#aaa]">
                      <div className="w-3 h-3 rounded-full border-2 border-[#cc2200] border-t-transparent animate-spin" />
                      Flashing...
                    </div>
                  ) : backupDone ? (
                    <div>
                      <style>{`
                        esp-web-install-button::part(button) {
                          background: #cc2200;
                          color: white;
                          font-weight: 700;
                          font-size: 0.75rem;
                          border: none;
                          border-radius: 8px;
                          padding: 8px 16px;
                          cursor: pointer;
                          font-family: Inter, sans-serif;
                          display: inline-flex;
                          align-items: center;
                          gap: 6px;
                        }
                        esp-web-install-button::part(button):hover {
                          background: #aa1800;
                        }
                      `}</style>
                      {/* eslint-disable-next-line react/no-unknown-property */}
                      <esp-web-install-button
                        ref={espButtonRef}
                        manifest={MANIFEST_URL(channel)}
                      >
                        <span slot="activate">⚡ Flash Firmware</span>
                        <span slot="unsupported">
                          Web Serial nicht unterstützt
                        </span>
                        <span slot="not-allowed">
                          Zugriff verweigert
                        </span>
                      </esp-web-install-button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#555]">
                      Zuerst Config sichern
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info note */}
        <div className="flex items-start gap-2 px-1">
          <Shield size={13} className="text-[#555] flex-shrink-0 mt-0.5" />
          <p className="text-[0.65rem] text-[#666]">
            Works in Chrome &amp; Edge only. Web Serial not supported in Firefox/Safari.
          </p>
        </div>
      </div>
    </div>
  )
}

