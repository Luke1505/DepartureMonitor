import { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Sun, Moon, ChevronRight, Wifi, WifiOff } from 'lucide-react'
import SetupPage from './pages/SetupPage.jsx'
import DevicePage from './pages/DevicePage.jsx'
import NotFound from './pages/NotFound.jsx'
import { listDevices } from './lib/api.js'

export const DarkModeContext = createContext({ darkMode: false, toggleDarkMode: () => {} })

export function useDarkMode() {
  return useContext(DarkModeContext)
}

function timeAgo(dateStr) {
  if (!dateStr) return 'nie'
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`
  return `vor ${Math.floor(diff / 86400)} Tagen`
}

function HomePage() {
  const { darkMode, toggleDarkMode } = useDarkMode()
  const [devices, setDevices] = useState(null)

  useEffect(() => {
    listDevices().then(setDevices).catch(() => setDevices([]))
  }, [])

  const online = (d) => d.last_seen && (Date.now() - new Date(d.last_seen)) < 5 * 60 * 1000

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex flex-col items-center justify-center p-6 gap-5">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#cc2200]" />
          <p className="text-[#cc2200] text-xs font-semibold tracking-widest uppercase">Transit Keychain</p>
        </div>
        <h1 className="text-[#111] dark:text-[#e4e4e7] text-2xl font-bold mb-1">DepartureMonitor</h1>
        <p className="text-[#aaa] dark:text-[#888] text-sm">ESP32 ÖPNV Abfahrtsanzeige</p>
      </div>

      <div className="w-full max-w-xs space-y-2">
        {devices === null ? (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4 text-center">
            <p className="text-xs text-[#aaa]">Lade Geräte...</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-5 text-center space-y-2">
            <p className="text-sm font-semibold text-[#111] dark:text-[#e4e4e7]">Kein Gerät gefunden</p>
            <p className="text-xs text-[#aaa] dark:text-[#888]">
              Scanne den QR-Code auf dem Display beim ersten Start.
            </p>
          </div>
        ) : (
          devices.map((d) => (
            <Link
              key={d.id}
              to={`/device/${d.id}`}
              className="flex items-center gap-3 bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4 hover:border-[#cc2200] dark:hover:border-[#cc2200] transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#111] dark:text-[#e4e4e7] truncate">
                  {d.name || 'Unbenanntes Gerät'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {online(d)
                    ? <Wifi size={10} className="text-green-500 flex-shrink-0" />
                    : <WifiOff size={10} className="text-[#aaa] flex-shrink-0" />
                  }
                  <p className="text-[0.65rem] text-[#aaa] dark:text-[#888]">{timeAgo(d.last_seen)}</p>
                  {d.firmware && (
                    <p className="text-[0.65rem] text-[#ccc] dark:text-[#555] font-mono ml-1">{d.firmware}</p>
                  )}
                </div>
              </div>
              <ChevronRight size={16} className="text-[#ccc] dark:text-[#555] group-hover:text-[#cc2200] transition-colors flex-shrink-0" />
            </Link>
          ))
        )}
      </div>

      <button
        onClick={toggleDarkMode}
        className="flex items-center gap-1.5 text-xs text-[#aaa] dark:text-[#888] hover:text-[#111] dark:hover:text-[#e4e4e7] transition-colors"
      >
        {darkMode ? <><Sun size={13} /> Light mode</> : <><Moon size={13} /> Dark mode</>}
      </button>
    </div>
  )
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('darkMode')
    if (stored !== null) return stored === '1'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.add('dark')
      localStorage.setItem('darkMode', '1')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('darkMode', '0')
    }
  }, [darkMode])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      if (localStorage.getItem('darkMode') === null) setDarkMode(e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleDarkMode = () => setDarkMode((d) => !d)

  return (
    <DarkModeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/setup/:id" element={<SetupPage />} />
          <Route path="/device/:id" element={<DevicePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DarkModeContext.Provider>
  )
}
