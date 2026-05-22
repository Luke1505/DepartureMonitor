import { useState, useEffect, useRef } from 'react'
import { ExternalLink, Plus, X, Eye, EyeOff } from 'lucide-react'

const inputCls = 'w-full bg-[#f8f8fa] dark:bg-[#222] border border-[#eeeeee] dark:border-[#2e2e2e] text-[#111] dark:text-[#e4e4e7] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#cc2200] transition-colors'
const labelCls = 'block text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-1'

function GreenBadge({ children }) {
  return (
    <span className="text-[0.6rem] font-bold bg-[#dcfce7] text-[#16a34a] px-2 py-0.5 rounded-full">
      {children}
    </span>
  )
}

function AmberBadge({ children }) {
  return (
    <span className="text-[0.6rem] font-bold bg-[#fef9c3] text-[#ca8a04] px-2 py-0.5 rounded-full">
      {children}
    </span>
  )
}

function StatusDot({ active }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-green-500 dot-pulse' : 'bg-yellow-400'}`} />
  )
}

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        className={inputCls + ' pr-8'}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder || '••••••••'}
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#aaa] hover:text-[#111] dark:hover:text-[#e4e4e7]"
      >
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}

function ApiCard({ title, badge, children }) {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm font-semibold text-[#111] dark:text-[#e4e4e7] flex-1">{title}</p>
        {badge}
      </div>
      {children}
    </div>
  )
}

export default function ApisTab({ config, onSave }) {
  const DEFAULT_APIS = {
    vrr: { endpoint: 'https://efa.vrr.de/vrr/XML_DM_REQUEST' },
    mvv: { endpoint: 'https://efa.mvv-muenchen.de/mvv/XML_DM_REQUEST' },
    db: { clientId: '', clientSecret: '' },
    hvv: { apiKey: '', endpoint: 'https://api.geofox.de/gti/public/' },
    custom: [],
  }

  const [apis, setApis] = useState(() => {
    const src = config.apis || {}
    return {
      ...DEFAULT_APIS,
      ...src,
      vrr: { ...DEFAULT_APIS.vrr, ...(src.vrr || {}) },
      mvv: { ...DEFAULT_APIS.mvv, ...(src.mvv || {}) },
      db: { ...DEFAULT_APIS.db, ...(src.db || {}) },
      hvv: { ...DEFAULT_APIS.hvv, ...(src.hvv || {}) },
      custom: src.custom || [],
    }
  })

  const initialized = useRef(false)
  const saveTimer = useRef(null)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      return
    }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSave({ apis }), 1500)
    return () => clearTimeout(saveTimer.current)
  }, [apis])

  function updateApi(key, updates) {
    setApis((prev) => ({ ...prev, [key]: { ...prev[key], ...updates } }))
  }

  function addCustomApi() {
    setApis((prev) => ({
      ...prev,
      custom: [...(prev.custom || []), { name: '', type: 'efa', endpoint: '', apiKey: '', authHeader: '' }],
    }))
  }

  function updateCustomApi(i, updates) {
    setApis((prev) => ({
      ...prev,
      custom: prev.custom.map((c, idx) => (idx === i ? { ...c, ...updates } : c)),
    }))
  }

  function deleteCustomApi(i) {
    setApis((prev) => ({
      ...prev,
      custom: prev.custom.filter((_, idx) => idx !== i),
    }))
  }

  const dbActive = !!(apis.db?.clientId && apis.db?.clientSecret)
  const hvvActive = !!(apis.hvv?.apiKey)

  return (
    <div className="space-y-3">
      {/* VRR */}
      <ApiCard title="VRR Rhein-Ruhr" badge={<GreenBadge>Kein Key nötig</GreenBadge>}>
        <div className="flex items-center gap-2 mb-2">
          <StatusDot active />
          <span className="text-xs text-[#aaa]">Verbunden</span>
        </div>
        <label className={labelCls}>Endpoint</label>
        <input className={inputCls} value={apis.vrr?.endpoint || ''} onChange={(e) => updateApi('vrr', { endpoint: e.target.value })} />
      </ApiCard>

      {/* MVV */}
      <ApiCard title="MVV München" badge={<GreenBadge>Kein Key nötig</GreenBadge>}>
        <div className="flex items-center gap-2 mb-2">
          <StatusDot active />
          <span className="text-xs text-[#aaa]">Verbunden</span>
        </div>
        <label className={labelCls}>Endpoint</label>
        <input className={inputCls} value={apis.mvv?.endpoint || ''} onChange={(e) => updateApi('mvv', { endpoint: e.target.value })} />
      </ApiCard>

      {/* DB */}
      <ApiCard title="DB national" badge={<AmberBadge>API Key nötig</AmberBadge>}>
        <div className="flex items-center gap-2 mb-3">
          <StatusDot active={dbActive} />
          <span className="text-xs text-[#aaa]">{dbActive ? 'Konfiguriert' : 'Nicht konfiguriert'}</span>
        </div>
        <div className="space-y-2">
          <div>
            <label className={labelCls}>Client ID</label>
            <input
              className={inputCls}
              value={apis.db?.clientId || ''}
              onChange={(e) => updateApi('db', { clientId: e.target.value })}
              placeholder="Client ID"
            />
          </div>
          <div>
            <label className={labelCls}>Client Secret</label>
            <SecretInput
              value={apis.db?.clientSecret || ''}
              onChange={(e) => updateApi('db', { clientSecret: e.target.value })}
            />
          </div>
          <a
            href="https://developers.deutschebahn.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[0.65rem] text-[#cc2200] hover:text-[#aa1800]"
          >
            developers.deutschebahn.com <ExternalLink size={11} />
          </a>
        </div>
      </ApiCard>

      {/* HVV */}
      <ApiCard title="HVV Hamburg" badge={<AmberBadge>API Key nötig</AmberBadge>}>
        <div className="flex items-center gap-2 mb-3">
          <StatusDot active={hvvActive} />
          <span className="text-xs text-[#aaa]">{hvvActive ? 'Konfiguriert' : 'Nicht konfiguriert'}</span>
        </div>
        <div className="space-y-2">
          <div>
            <label className={labelCls}>API Key</label>
            <SecretInput
              value={apis.hvv?.apiKey || ''}
              onChange={(e) => updateApi('hvv', { apiKey: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Endpoint</label>
            <input
              className={inputCls}
              value={apis.hvv?.endpoint || 'https://api.geofox.de/gti/public/'}
              onChange={(e) => updateApi('hvv', { endpoint: e.target.value })}
            />
          </div>
          <a
            href="https://hvv.de/api"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[0.65rem] text-[#cc2200] hover:text-[#aa1800]"
          >
            hvv.de/api <ExternalLink size={11} />
          </a>
        </div>
      </ApiCard>

      {/* Custom APIs */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-[#111] dark:text-[#e4e4e7]">Eigene APIs</p>
          <button
            onClick={addCustomApi}
            className="flex items-center gap-1 text-[0.65rem] font-bold text-[#cc2200] hover:text-[#aa1800] active:scale-90 transition-transform"
          >
            <Plus size={12} /> Hinzufügen
          </button>
        </div>

        {(apis.custom || []).length === 0 && (
          <p className="text-[#aaa] dark:text-[#888] text-xs">Keine eigenen APIs konfiguriert.</p>
        )}

        {(apis.custom || []).map((api, i) => (
          <div key={i} className="border border-[#eeeeee] dark:border-[#2e2e2e] rounded-xl p-3 mb-2 space-y-2 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#111] dark:text-[#e4e4e7]">
                {api.name || `API ${i + 1}`}
              </span>
              <button onClick={() => deleteCustomApi(i)} className="text-[#aaa] hover:text-[#cc2200] active:scale-90 transition-transform">
                <X size={14} />
              </button>
            </div>
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={api.name} onChange={(e) => updateCustomApi(i, { name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Typ</label>
              <select className={inputCls} value={api.type} onChange={(e) => updateCustomApi(i, { type: e.target.value })}>
                <option value="efa">EFA (wie VRR/MVV)</option>
                <option value="rest">Custom REST</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Endpoint</label>
              <input className={inputCls} value={api.endpoint} onChange={(e) => updateCustomApi(i, { endpoint: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className={labelCls}>API Key (optional)</label>
              <SecretInput value={api.apiKey} onChange={(e) => updateCustomApi(i, { apiKey: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Auth Header</label>
              <input className={inputCls} value={api.authHeader} onChange={(e) => updateCustomApi(i, { authHeader: e.target.value })} placeholder="z.B. x-api-key" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
