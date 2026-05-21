import { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Zap, Sun, Moon } from 'lucide-react'
import SetupPage from './pages/SetupPage.jsx'
import DevicePage from './pages/DevicePage.jsx'
import FlashPage from './pages/FlashPage.jsx'
import NotFound from './pages/NotFound.jsx'

export const DarkModeContext = createContext({ darkMode: false, toggleDarkMode: () => {} })

export function useDarkMode() {
  return useContext(DarkModeContext)
}

function HomePage() {
  const { darkMode, toggleDarkMode } = useDarkMode()
  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center">
        <p className="text-[#cc2200] text-xs font-semibold tracking-widest uppercase mb-2">Transit Keychain</p>
        <h1 className="text-[#111] dark:text-[#e4e4e7] text-2xl font-bold mb-1">DepartureMonitor</h1>
        <p className="text-[#aaa] dark:text-[#888] text-sm">ESP32 ÖPNV Abfahrtsanzeige</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          to="/flash"
          className="flex items-center justify-center gap-2 bg-[#cc2200] hover:bg-[#aa1800] text-white font-bold text-sm rounded-lg py-2.5 transition-colors"
        >
          <Zap size={14} /> Gerät flashen
        </Link>
        <p className="text-[#aaa] dark:text-[#888] text-xs text-center">
          Gerät bereits eingerichtet? Scanne den QR-Code auf dem Display.
        </p>
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

  // Listen to system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      if (localStorage.getItem('darkMode') === null) {
        setDarkMode(e.matches)
      }
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
          <Route path="/flash" element={<FlashPage />} />
          <Route path="/flash/:deviceId" element={<FlashPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DarkModeContext.Provider>
  )
}
