import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle, AlertTriangle, Zap, Usb, Shield, Download, Moon, Sun, ArrowLeft, Cpu } from 'lucide-react'
import { getDevice, getConfig, triggerFlashBuild, getFlashBuildStatus } from '../lib/api.js'
import { showToast } from '../lib/toast.js'
import { useDarkMode } from '../App.jsx'

function StepBadge({ n, done, active }) {
  if (done) return (
    <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 animate-scale-in">
      <CheckCircle size={14} className="text-white" />
    </span>
  )
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border-2 ${
      active
        ? 'border-[#cc2200] text-[#cc2200]'
        : 'border-[#ccc] dark:border-[#444] text-[#aaa] dark:text-[#666]'
    }`}>{n}</span>
  )
}

export default function FlashPage() {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  const { darkMode, toggleDarkMode } = useDarkMode()

  // Build state
  const [buildState, setBuildState] = useState('idle') // idle | building | ready | error
  const [buildJobId, setBuildJobId] = useState(null)
  const [cacheKey, setCacheKey] = useState(null)
  const [buildVersion, setBuildVersion] = useState(null)
  const [buildError, setBuildError] = useState(null)

  const [device, setDevice] = useState(null)
  const [deviceConfig, setDeviceConfig] = useState(null)
  const [deviceLoading, setDeviceLoading] = useState(!!deviceId)

  // Step 1 state
  const [backupDone, setBackupDone] = useState(!deviceId)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupConfig, setBackupConfig] = useState(null)

  // Flash state
  const [flashState, setFlashState] = useState('idle') // idle | flashing | success | error
  const [flashError, setFlashError] = useState(null)
  const [postFlashCountdown, setPostFlashCountdown] = useState(5)

  // Stable UUID for the post-flash setup QR code — must not change on re-render
  const [setupId] = useState(() => crypto.randomUUID())

  const espButtonRef = useRef(null)
  const pollRef = useRef(null)
  const webSerialSupported = 'serial' in navigator

  useEffect(() => { document.title = 'Firmware flashen — Transit' }, [])

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

  // Trigger firmware build on mount
  useEffect(() => {
    setBuildState('building')
    triggerFlashBuild(deviceId || null)
      .then((res) => {
        setBuildJobId(res.job_id)
        setCacheKey(res.cache_key)
        if (res.version) setBuildVersion(res.version)
        if (res.status === 'ready') {
          setBuildState('ready')
        }
      })
      .catch(() => {
        setBuildState('error')
        setBuildError('Build-Worker nicht erreichbar')
      })
  }, [deviceId])

  // Poll build status while building
  useEffect(() => {
    if (buildState !== 'building' || !buildJobId) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await getFlashBuildStatus(buildJobId)
        if (res.status === 'ready') {
          clearInterval(pollRef.current)
          setCacheKey(res.cache_key)
          if (res.version) setBuildVersion(res.version)
          setBuildState('ready')
        } else if (res.status === 'error') {
          clearInterval(pollRef.current)
          setBuildState('error')
          setBuildError(res.error || 'Kompilierung fehlgeschlagen')
        }
      } catch (_) { /* retry next tick */ }
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [buildState, buildJobId])

  const manifestUrl = cacheKey ? `/api/firmware/flash-manifest/${cacheKey}` : null

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

  // Re-attach esp-web-tools listeners whenever the button element appears in the DOM.
  // Deps on backupDone + manifestUrl because the element is conditionally rendered on both.
  useEffect(() => {
    const el = espButtonRef.current
    if (!el) return
    function onStateChanged(e) {
      const state = e.detail?.state
      if (state === 'installing') setFlashState('flashing')
      if (state === 'finished') setFlashState('success')
    }
    function onError(e) {
      setFlashError(e.detail?.message || 'Flash fehlgeschlagen')
      setFlashState('error')
    }
    el.addEventListener('state-changed', onStateChanged)
    el.addEventListener('error', onError)
    return () => {
      el.removeEventListener('state-changed', onStateChanged)
      el.removeEventListener('error', onError)
    }
  }, [backupDone, manifestUrl])

  // Post-flash countdown redirect
  useEffect(() => {
    if (flashState !== 'success' || !deviceId) return
    if (postFlashCountdown <= 0) { navigate(`/device/${deviceId}`); return }
    const t = setTimeout(() => setPostFlashCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [flashState, postFlashCountdown, deviceId, navigate])

  async function handleBackup() {
    if (!deviceId) { setBackupDone(true); return }
    if (!deviceConfig) {
      showToast('Config konnte nicht geladen werden — bitte Seite neu laden')
      return
    }
    setBackupLoading(true)
    try { setBackupConfig(deviceConfig); setBackupDone(true) }
    catch (e) { console.error(e) }
    finally { setBackupLoading(false) }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(backupConfig, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `config-${deviceId || 'backup'}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const cardCls = 'bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-5'
  const labelCls = 'block text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-1'

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] text-[#111] dark:text-[#e4e4e7]">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-white dark:bg-[#1a1a1a] border-b border-[#eeeeee] dark:border-[#2e2e2e] h-14 flex items-center px-4 gap-3">
        <span className="w-2 h-2 rounded-full bg-[#cc2200] flex-shrink-0" />
        <span className="text-sm font-semibold flex-1 text-[#111] dark:text-[#e4e4e7]">DepartureMonitor</span>
        {deviceId && (
          <Link
            to={`/device/${deviceId}`}
            className="flex items-center gap-1 text-xs text-[#aaa] dark:text-[#888] hover:text-[#111] dark:hover:text-[#e4e4e7] transition-colors"
          >
            <ArrowLeft size={14} /> Zurück
          </Link>
        )}
        <button
          onClick={toggleDarkMode}
          className="p-1.5 rounded-lg text-[#aaa] dark:text-[#888] hover:text-[#111] dark:hover:text-[#e4e4e7] hover:bg-[#f0f2f5] dark:hover:bg-[#222] transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4 animate-fade-in-up">
        {/* Header card */}
        <div className={cardCls}>
          <div className="flex items-start gap-3">
            <Zap size={24} className="text-[#cc2200] flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold text-[#111] dark:text-white">Firmware flashen</h1>
              <p className="text-xs text-[#888] mt-0.5">
                Gerät per USB-C verbinden und Firmware direkt im Browser flashen
              </p>
            </div>
          </div>
        </div>

        {/* Build status card */}
        <div className={cardCls}>
          <p className={labelCls}>Firmware</p>
          {buildState === 'building' && (
            <div className="flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-[#cc2200] border-t-transparent animate-spin flex-shrink-0" />
              <span className="text-xs text-[#888]">Firmware wird kompiliert…</span>
            </div>
          )}
          {buildState === 'ready' && (
            <div className="flex items-center gap-2.5">
              <Cpu size={15} className="text-[#cc2200] flex-shrink-0" />
              <div>
                <span className="text-sm font-bold text-[#111] dark:text-white font-mono">
                  {buildVersion || 'dev'}
                </span>
                <span className="ml-2 text-[0.6rem] font-bold bg-green-500/15 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                  Bereit
                </span>
              </div>
            </div>
          )}
          {buildState === 'error' && (
            <div className="flex items-start gap-2 text-xs text-[#cc2200]">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Kompilierung fehlgeschlagen</p>
                {buildError && <p className="mt-0.5 text-[#cc2200]/70">{buildError}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Device card (if deviceId) */}
        {deviceId && (
          <div className={cardCls}>
            <p className={labelCls}>Gerät</p>
            {deviceLoading ? (
              <p className="text-xs text-[#888]">Laden...</p>
            ) : device ? (
              <div className="space-y-1">
                <p className="text-[#111] dark:text-white font-semibold text-sm">{device.name || 'Unbenannt'}</p>
                <p className="text-xs text-[#888]">
                  Aktuelle Firmware: <span className="font-mono text-[#aaa]">{device.firmware || 'unbekannt'}</span>
                </p>
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
          <div className="bg-[#cc220010] border border-[#cc220030] rounded-[14px] p-4 flex gap-3 items-start">
            <AlertTriangle size={18} className="text-[#cc2200] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#cc2200]">Browser nicht unterstützt</p>
              <p className="text-xs text-[#cc2200]/70 mt-1">
                Web-Flashing erfordert Chrome oder Edge. Firefox und Safari unterstützen Web Serial nicht.
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
                <p className={`text-sm font-semibold ${backupDone ? 'text-[#888]' : 'text-[#111] dark:text-white'}`}>
                  Config sichern
                </p>
                {!deviceId ? (
                  <p className="text-xs text-[#888] mt-0.5">Kein Gerät verknüpft — Schritt wird übersprungen.</p>
                ) : backupDone ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                      <CheckCircle size={13} /> Config gesichert
                    </p>
                    {backupConfig && (
                      <>
                        <div className="bg-white inline-block p-2 rounded-lg">
                          <QRCodeSVG value={JSON.stringify(backupConfig)} size={120} level="M" />
                        </div>
                        <button
                          onClick={downloadJson}
                          className="flex items-center gap-1.5 text-xs text-[#cc2200] hover:text-[#aa1800] font-medium active:scale-[0.98] transition-all"
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
                      className="bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-all active:scale-[0.98]"
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
                <p className={`text-sm font-semibold ${backupDone ? 'text-[#111] dark:text-white' : 'text-[#aaa] dark:text-[#666]'}`}>
                  USB-C verbinden
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Usb size={14} className={backupDone ? 'text-[#cc2200]' : 'text-[#444]'} />
                  <p className={`text-xs ${backupDone ? 'text-[#aaa]' : 'text-[#555]'}`}>
                    Gerät per USB-C mit diesem Computer verbinden
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: Flash */}
            <div className="flex gap-3">
              <StepBadge n={3} done={flashState === 'success'} active={backupDone && buildState === 'ready'} />
              <div className="flex-1">
                <p className={`text-sm font-semibold ${backupDone ? 'text-[#111] dark:text-white' : 'text-[#aaa] dark:text-[#666]'}`}>
                  Firmware flashen
                </p>
                <div className="mt-2">
                  {flashState === 'success' ? (
                    <div className="space-y-2">
                      <p className="text-green-600 dark:text-green-400 font-bold text-sm flex items-center gap-2">
                        <CheckCircle size={16} /> Flash abgeschlossen!
                      </p>
                      {deviceId ? (
                        <p className="text-xs text-[#888]">
                          Weiterleitung zur Konfiguration in {postFlashCountdown}s…
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-[#888]">Scanne den QR Code für die Einrichtung:</p>
                          <div className="bg-white inline-block p-2 rounded-lg">
                            <QRCodeSVG
                              value={`${window.location.origin}/setup/${setupId}`}
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
                      <button className="mt-2 text-[#cc2200] underline" onClick={() => setFlashState('idle')}>
                        Erneut versuchen
                      </button>
                    </div>
                  ) : flashState === 'flashing' ? (
                    <div className="flex items-center gap-2 text-xs text-[#aaa]">
                      <div className="w-3 h-3 rounded-full border-2 border-[#cc2200] border-t-transparent animate-spin" />
                      Flash läuft…
                    </div>
                  ) : buildState === 'building' ? (
                    <p className="text-xs text-[#aaa] dark:text-[#555]">Warte auf Firmware-Build…</p>
                  ) : buildState === 'error' ? (
                    <p className="text-xs text-[#cc2200]">Build fehlgeschlagen — kein Flash möglich</p>
                  ) : backupDone && manifestUrl ? (
                    <div>
                      <style>{`
                        esp-web-install-button::part(button) { display: none !important; }
                      `}</style>
                      {/* eslint-disable-next-line react/no-unknown-property */}
                      <esp-web-install-button ref={espButtonRef} manifest={manifestUrl}>
                        <button
                          slot="activate"
                          className="bg-[#cc2200] hover:bg-[#aa1800] active:scale-[0.98] text-white text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5"
                        >
                          <Zap size={13} /> Firmware flashen
                        </button>
                        <span slot="unsupported">Web Serial nicht unterstützt</span>
                        <span slot="not-allowed">Zugriff verweigert</span>
                      </esp-web-install-button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#aaa] dark:text-[#555]">Zuerst Config sichern</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info note */}
        <div className="flex items-start gap-2 px-1">
          <Shield size={13} className="text-[#aaa] dark:text-[#555] flex-shrink-0 mt-0.5" />
          <p className="text-[0.65rem] text-[#aaa] dark:text-[#555]">
            Nur in Chrome &amp; Edge verfügbar. Firefox und Safari unterstützen Web Serial nicht.
          </p>
        </div>
      </div>
    </div>
  )
}
