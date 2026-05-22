import { useState, useRef, useEffect } from 'react'
import { Battery, BatteryLow, Sun, Moon, Zap, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDarkMode } from '../App.jsx'
import { registerDevice, getFirmwareLatest } from '../lib/api.js'
import { showToast } from '../lib/toast.js'

function formatLastSeen(lastSeen) {
  if (!lastSeen) return null
  const diff = Math.floor((Date.now() - new Date(lastSeen)) / 1000)
  if (diff < 60) return 'gerade eben'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `vor ${mins} Min.`
  const hrs = Math.floor(mins / 60)
  return `vor ${hrs} Std.`
}

function compareVersions(a, b) {
  // Returns true if b > a (b is newer)
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

export default function DeviceHeader({ device, deviceId, flash, onDeviceUpdate }) {
  const { darkMode, toggleDarkMode } = useDarkMode()
  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState(device?.name || '')
  const [latestFirmware, setLatestFirmware] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!device?.firmware) return
    getFirmwareLatest()
      .then(setLatestFirmware)
      .catch(() => {}) // silently ignore if no firmware endpoint
  }, [device?.firmware])

  async function saveName() {
    if (!nameValue.trim() || nameValue === device?.name) {
      setEditing(false)
      return
    }
    try {
      const updated = await registerDevice(deviceId, { name: nameValue.trim() })
      onDeviceUpdate(updated)
    } catch (e) {
      console.error(e)
      showToast('Name konnte nicht gespeichert werden', 'error')
    }
    setEditing(false)
  }

  function startEdit() {
    setNameValue(device?.name || '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const batteryLow = (device?.battery_pct ?? 100) < 20
  const firmwareOutdated = latestFirmware?.version && device?.firmware
    ? compareVersions(device.firmware, latestFirmware.version)
    : false

  return (
    <header className="sticky top-0 z-20 bg-white dark:bg-[#1a1a1a] border-b border-[#eeeeee] dark:border-[#2e2e2e] h-14 flex items-center px-4 gap-3">
      {/* Back button */}
      <Link
        to="/"
        className="p-1.5 rounded-lg text-[#aaa] dark:text-[#888] hover:text-[#111] dark:hover:text-[#e4e4e7] hover:bg-[#f0f2f5] dark:hover:bg-[#222] transition-colors flex-shrink-0"
        aria-label="Zurück"
      >
        <ArrowLeft size={16} />
      </Link>

      <div className="flex-1 flex items-center gap-3 min-w-0">
        {/* Brand dot */}
        <span className="w-2 h-2 rounded-full bg-[#cc2200] flex-shrink-0" />

        {/* Device name */}
        {editing ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
            maxLength={32}
            className="text-sm font-semibold text-[#111] dark:text-[#e4e4e7] bg-[#f8f8fa] dark:bg-[#222] border border-[#cc2200] rounded px-2 py-0.5 outline-none min-w-0 w-40"
          />
        ) : (
          <button
            onClick={startEdit}
            className="text-sm font-semibold text-[#111] dark:text-[#e4e4e7] hover:text-[#cc2200] transition-colors truncate"
          >
            {device?.name || 'Unnamed Device'}
          </button>
        )}

        {/* Last seen */}
        {device?.last_seen && (
          <span className="text-[0.65rem] text-[#aaa] dark:text-[#888] flex-shrink-0">
            {formatLastSeen(device.last_seen)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Firmware + update button */}
        {device?.firmware && (
          <div className="flex items-center gap-1.5">
            <span className="text-[0.65rem] text-[#aaa] dark:text-[#888] font-mono">
              fw {device.firmware}
            </span>
            {firmwareOutdated && (
              <Link
                to={`/device/${deviceId}?tab=settings`}
                className="flex items-center gap-0.5 text-[0.6rem] font-bold bg-[#cc220018] text-[#cc2200] hover:bg-[#cc220030] px-1.5 py-0.5 rounded transition-colors"
                title={`Update auf ${latestFirmware.version}`}
              >
                <Zap size={10} /> Update
              </Link>
            )}
          </div>
        )}

        {/* Battery */}
        {device?.battery_pct != null && (
          <span className={`flex items-center gap-1 text-[0.65rem] font-medium ${batteryLow ? 'text-[#cc2200]' : 'text-[#aaa] dark:text-[#888]'}`}>
            {batteryLow ? <BatteryLow size={14} /> : <Battery size={14} />}
            {device.battery_pct}%
          </span>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-1.5 rounded-lg text-[#aaa] dark:text-[#888] hover:text-[#111] dark:hover:text-[#e4e4e7] hover:bg-[#f0f2f5] dark:hover:bg-[#222] transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* Saved flash overlay */}
      {flash && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="bg-[#cc2200] text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
            Gespeichert ✓
          </span>
        </div>
      )}
    </header>
  )
}
