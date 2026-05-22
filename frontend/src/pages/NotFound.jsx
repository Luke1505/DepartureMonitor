import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function NotFound() {
  useEffect(() => { document.title = '404 — Transit' }, [])
  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex items-center justify-center p-4">
      <div className="text-center animate-fade-in-up">
        <div className="flex justify-center mb-5">
          <span className="w-2 h-2 rounded-full bg-[#cc2200]" />
        </div>
        <p className="text-[#cc2200] font-bold text-7xl tracking-tight mb-3">404</p>
        <h1 className="text-[#111] dark:text-[#e4e4e7] text-lg font-semibold mb-1">
          Seite nicht gefunden
        </h1>
        <p className="text-[#aaa] dark:text-[#888] text-xs mb-7">
          Diese Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 bg-[#cc2200] hover:bg-[#aa1800] active:scale-[0.97] text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all"
        >
          <ArrowLeft size={13} />
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}
