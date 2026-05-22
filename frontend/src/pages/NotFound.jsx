import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#111] flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-[#cc2200] text-6xl font-bold mb-4">404</p>
        <h1 className="text-[#111] dark:text-[#e4e4e7] text-xl font-semibold mb-2">
          Seite nicht gefunden
        </h1>
        <p className="text-[#aaa] dark:text-[#888] text-sm mb-6">
          Diese Seite existiert nicht.
        </p>
        <Link
          to="/"
          className="text-[#cc2200] hover:text-[#aa1800] text-sm font-medium underline"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}
