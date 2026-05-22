import { useState, useCallback, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Home, Briefcase, Star, ShoppingCart, Dumbbell, Utensils, GraduationCap, Cross,
  Settings, X, GripVertical, Search, ChevronDown, ChevronUp, RefreshCw,
  Bus, TramFront, TrainFront,
} from 'lucide-react'
import { searchStops, getDepartures } from '../lib/api.js'

const ICONS = [
  { id: 'house', Icon: Home },
  { id: 'briefcase', Icon: Briefcase },
  { id: 'star', Icon: Star },
  { id: 'cart', Icon: ShoppingCart },
  { id: 'dumbbell', Icon: Dumbbell },
  { id: 'utensils', Icon: Utensils },
  { id: 'graduation', Icon: GraduationCap },
  { id: 'cross', Icon: Cross },
]

const TRANSPORT_TYPES = ['U', 'S', 'B', 'T', 'R']
const API_OPTIONS = [
  { value: 'vrr', label: 'VRR Rhein-Ruhr' },
  { value: 'mvv', label: 'MVV München' },
  { id: 'db', value: 'db', label: 'DB national' },
  { value: 'hvv', label: 'HVV Hamburg' },
  { value: 'custom', label: 'Custom' },
]

const EMPTY_STATION = {
  label: '',
  icon: 'house',
  stopId: '',
  stopName: '',
  api: 'vrr',
  filterTypes: ['U', 'S', 'B', 'T', 'R'],
  filterLines: '',
  lat: null,
  lon: null,
  timeWindows: [],
}

function StationIcon({ iconId, size = 14 }) {
  const found = ICONS.find((i) => i.id === iconId)
  if (!found) return <House size={size} />
  const { Icon } = found
  return <Icon size={size} />
}

const TYPE_ICONS = {
  U: TramFront,
  S: TrainFront,
  T: TramFront,
  R: TrainFront,
  B: Bus,
}

function DeparturePreview({ stopId, api, deviceId }) {
  const [state, setState] = useState('idle') // idle | loading | loaded | error
  const [departures, setDepartures] = useState([])

  async function load() {
    setState('loading')
    try {
      const result = await getDepartures(stopId, api, deviceId)
      setDepartures(result.departures || [])
      setState('loaded')
    } catch {
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <button
        onClick={load}
        className="flex items-center gap-1.5 text-xs font-medium text-[#cc2200] hover:text-[#aa1800] transition-colors"
      >
        <RefreshCw size={11} /> Abfahrten laden
      </button>
    )
  }
  if (state === 'loading') {
    return <p className="text-xs text-[#aaa]">Lade…</p>
  }
  if (state === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-[#cc2200]">Fehler beim Laden</p>
        <button onClick={load} className="text-xs text-[#aaa] hover:text-[#cc2200]">
          <RefreshCw size={11} />
        </button>
      </div>
    )
  }
  if (departures.length === 0) {
    return <p className="text-xs text-[#aaa]">Keine Abfahrten gefunden</p>
  }

  return (
    <div className="bg-[#f8f8fa] dark:bg-[#222] rounded-lg overflow-hidden border border-[#eeeeee] dark:border-[#2e2e2e]">
      {departures.slice(0, 5).map((d, i) => {
        const TypeIcon = TYPE_ICONS[d.type] || Bus
        return (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5 border-b border-[#eeeeee] dark:border-[#2e2e2e] last:border-0"
          >
            <TypeIcon size={12} className="text-[#555] dark:text-[#888] flex-shrink-0" />
            <span className="text-xs font-mono font-bold text-[#111] dark:text-[#e4e4e7] w-8 flex-shrink-0">{d.line}</span>
            <span className="flex-1 text-xs text-[#555] dark:text-[#aaa] truncate">{d.destination}</span>
            <span className="text-xs font-semibold text-[#111] dark:text-[#e4e4e7] flex-shrink-0">
              {d.countdown === 0 ? 'Jetzt' : `${d.countdown} Min`}
            </span>
            {d.delay > 0 && (
              <span className="text-[0.6rem] font-bold text-[#cc2200] flex-shrink-0">+{d.delay}</span>
            )}
          </div>
        )
      })}
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[0.6rem] text-[#aaa]">{departures.length} Abfahrten</span>
        <button onClick={load} className="text-[#aaa] hover:text-[#cc2200] transition-colors">
          <RefreshCw size={10} />
        </button>
      </div>
    </div>
  )
}

function StationEditForm({ station, onChange, onDelete, deviceId }) {
  const [stopQuery, setStopQuery] = useState('')
  const [stopResults, setStopResults] = useState([])
  const [searching, setSearching] = useState(false)

  async function doSearch() {
    if (!stopQuery.trim()) return
    setSearching(true)
    try {
      const results = await searchStops(stopQuery, station.api)
      setStopResults(results)
    } catch (e) {
      console.error(e)
    } finally {
      setSearching(false)
    }
  }

  function selectStop(stop) {
    onChange({ stopId: stop.id, stopName: stop.name })
    setStopResults([])
    setStopQuery('')
  }

  function toggleType(t) {
    const types = station.filterTypes.includes(t)
      ? station.filterTypes.filter((x) => x !== t)
      : [...station.filterTypes, t]
    onChange({ filterTypes: types })
  }

  function addTimeWindow() {
    if (station.timeWindows.length >= 2) return
    onChange({ timeWindows: [...station.timeWindows, { from: '06:00', to: '09:00' }] })
  }

  function removeTimeWindow(i) {
    const tw = station.timeWindows.filter((_, idx) => idx !== i)
    onChange({ timeWindows: tw })
  }

  function updateTimeWindow(i, field, val) {
    const tw = station.timeWindows.map((w, idx) => idx === i ? { ...w, [field]: val } : w)
    onChange({ timeWindows: tw })
  }

  const inputCls = 'w-full bg-[#f8f8fa] dark:bg-[#222] border border-[#eeeeee] dark:border-[#2e2e2e] text-[#111] dark:text-[#e4e4e7] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#cc2200] transition-colors'
  const labelCls = 'block text-[0.58rem] font-bold tracking-[0.12em] uppercase text-[#ccc] dark:text-[#555] mb-1'

  return (
    <div className="border-t border-[#eeeeee] dark:border-[#2e2e2e] pt-4 mt-2 space-y-4">
      {/* Label */}
      <div>
        <label className={labelCls}>Label</label>
        <input
          className={inputCls}
          value={station.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="z.B. Zuhause"
        />
      </div>

      {/* Icon picker */}
      <div>
        <label className={labelCls}>Icon</label>
        <div className="flex gap-2 overflow-x-auto py-1">
          {ICONS.map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => onChange({ icon: id })}
              className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors ${
                station.icon === id
                  ? 'border-[#cc2200] text-[#cc2200] bg-[#cc220010]'
                  : 'border-transparent text-[#cc2200] hover:border-[#cc2200] bg-[#f8f8fa] dark:bg-[#222]'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      {/* API selector */}
      <div>
        <label className={labelCls}>API</label>
        <select
          className={inputCls}
          value={station.api}
          onChange={(e) => onChange({ api: e.target.value })}
        >
          {API_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Stop search */}
      <div>
        <label className={labelCls}>Haltestelle</label>
        {station.stopName && (
          <p className="text-xs text-[#cc2200] font-medium mb-1">
            {station.stopName} <span className="text-[#aaa] font-mono">{station.stopId}</span>
          </p>
        )}
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={stopQuery}
            onChange={(e) => setStopQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Haltestellenname suchen..."
          />
          <button
            onClick={doSearch}
            disabled={searching}
            className="flex-shrink-0 bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-50 text-white text-xs font-bold px-3 rounded-lg flex items-center gap-1"
          >
            <Search size={12} />
            Suchen
          </button>
        </div>
        {stopResults.length > 0 && (
          <div className="mt-1 bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-lg shadow-lg overflow-hidden">
            {stopResults.slice(0, 8).map((stop) => (
              <button
                key={stop.id}
                onClick={() => selectStop(stop)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[#f0f2f5] dark:hover:bg-[#222] flex items-center justify-between"
              >
                <span className="font-medium text-[#111] dark:text-[#e4e4e7]">{stop.name}</span>
                {stop.city && <span className="text-[#aaa] dark:text-[#888]">{stop.city}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Live departure preview */}
        {station.stopId && (
          <div className="mt-2">
            <DeparturePreview stopId={station.stopId} api={station.api} deviceId={deviceId} />
          </div>
        )}
      </div>

      {/* Transport type filter */}
      <div>
        <label className={labelCls}>Verkehrsmittel</label>
        <div className="flex gap-2 flex-wrap">
          {TRANSPORT_TYPES.map((t) => {
            const on = station.filterTypes.includes(t)
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                  on
                    ? 'bg-[#111] dark:bg-white text-white dark:text-[#111] border-[#111] dark:border-white'
                    : 'bg-transparent text-[#aaa] dark:text-[#888] border-[#ddd] dark:border-[#2e2e2e]'
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter lines */}
      <div>
        <label className={labelCls}>Bestimmte Linien</label>
        <input
          className={inputCls}
          value={station.filterLines}
          onChange={(e) => onChange({ filterLines: e.target.value })}
          placeholder="z.B. U78, S1, 705 (leer = alle)"
        />
      </div>

      {/* Time windows */}
      <div>
        <label className={labelCls}>Auto-Station Zeitfenster</label>
        <div className="space-y-2">
          {station.timeWindows.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="time"
                className={`${inputCls} flex-1`}
                value={w.from}
                onChange={(e) => updateTimeWindow(i, 'from', e.target.value)}
              />
              <span className="text-[#aaa] text-xs">–</span>
              <input
                type="time"
                className={`${inputCls} flex-1`}
                value={w.to}
                onChange={(e) => updateTimeWindow(i, 'to', e.target.value)}
              />
              <button
                onClick={() => removeTimeWindow(i)}
                className="text-[#aaa] hover:text-[#cc2200] p-1"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {station.timeWindows.length < 2 && (
            <button
              onClick={addTimeWindow}
              className="text-[#cc2200] text-xs font-medium hover:text-[#aa1800]"
            >
              + Zeitfenster hinzufügen
            </button>
          )}
        </div>
      </div>

      {/* Delete station */}
      <button
        onClick={onDelete}
        className="w-full text-xs font-semibold text-[#cc2200] border border-[#fecaca] dark:border-[#cc220040] rounded-lg py-2 hover:bg-[#cc220008] transition-colors"
      >
        Haltestelle entfernen
      </button>
    </div>
  )
}

function SortableStation({ station, index, isExpanded, onToggle, onChange, onDelete, deviceId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: station._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const StIcon = ICONS.find((i) => i.id === station.icon)?.Icon || House

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-[#1a1a1a] border border-[#eeeeee] dark:border-[#2e2e2e] rounded-[14px] p-3 mb-2"
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-[#ccc] dark:text-[#555] cursor-grab active:cursor-grabbing touch-none p-1"
        >
          <GripVertical size={16} />
        </button>

        {/* Icon */}
        <span className="text-[#cc2200]">
          <StIcon size={16} />
        </span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#111] dark:text-[#e4e4e7] truncate">
              {station.label || 'Unbenannt'}
            </span>
            {index === 0 && (
              <span className="text-[0.6rem] font-bold bg-[#cc220015] text-[#cc2200] px-1.5 py-0.5 rounded">
                Primär
              </span>
            )}
          </div>
          {station.stopName && (
            <p className="text-[0.65rem] text-[#aaa] dark:text-[#888] truncate">{station.stopName}</p>
          )}
        </div>

        {/* API badge */}
        <span className="text-[0.6rem] font-bold text-[#aaa] dark:text-[#888] border border-[#eeeeee] dark:border-[#2e2e2e] px-1.5 py-0.5 rounded">
          {station.api?.toUpperCase()}
        </span>

        {/* Edit button */}
        <button
          onClick={onToggle}
          className={`p-1.5 rounded-lg transition-colors ${
            isExpanded
              ? 'bg-[#cc220015] text-[#cc2200]'
              : 'text-[#aaa] dark:text-[#888] hover:text-[#cc2200]'
          }`}
        >
          <Settings size={14} />
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-1.5 text-[#aaa] dark:text-[#888] hover:text-[#cc2200] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {isExpanded && (
        <StationEditForm
          station={station}
          onChange={(updates) => onChange({ ...station, ...updates })}
          onDelete={onDelete}
          deviceId={deviceId}
        />
      )}
    </div>
  )
}

export default function StationsTab({ config, deviceId, onSave }) {
  const [stations, setStations] = useState(() =>
    (config.stations || []).map((s, i) => ({ ...s, _id: s._id || `s-${i}-${Date.now()}` }))
  )
  const [expandedId, setExpandedId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newStation, setNewStation] = useState({ ...EMPTY_STATION, _id: 'new' })

  const initialized = useRef(false)
  const saveTimer = useRef(null)

  // Auto-save when stations change (skips initial render)
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      return
    }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const clean = stations.map(({ _id, ...rest }) => rest)
      onSave({ stations: clean })
    }, 1500)
    return () => clearTimeout(saveTimer.current)
  }, [stations])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = stations.findIndex((s) => s._id === active.id)
    const newIndex = stations.findIndex((s) => s._id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    setStations(arrayMove(stations, oldIndex, newIndex))
  }

  function updateStation(id, updated) {
    setStations((prev) => prev.map((s) => (s._id === id ? updated : s)))
  }

  function deleteStation(id) {
    setStations((prev) => prev.filter((s) => s._id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function addStation() {
    const toAdd = { ...newStation, _id: `s-${Date.now()}` }
    setStations((prev) => [...prev, toAdd])
    setNewStation({ ...EMPTY_STATION, _id: 'new' })
    setAdding(false)
  }

  function save() {
    // Strip internal _id fields before saving
    const clean = stations.map(({ _id, ...rest }) => rest)
    onSave({ stations: clean })
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stations.map((s) => s._id)} strategy={verticalListSortingStrategy}>
          {stations.map((station, index) => (
            <SortableStation
              key={station._id}
              station={station}
              index={index}
              isExpanded={expandedId === station._id}
              onToggle={() => setExpandedId((id) => id === station._id ? null : station._id)}
              onChange={(updated) => updateStation(station._id, updated)}
              onDelete={() => deleteStation(station._id)}
              deviceId={deviceId}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add station */}
      {adding ? (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#cc2200] rounded-[14px] p-3 mb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#111] dark:text-[#e4e4e7]">Neue Haltestelle</span>
            <button onClick={() => setAdding(false)} className="text-[#aaa] hover:text-[#cc2200]">
              <X size={14} />
            </button>
          </div>
          <StationEditForm
            station={newStation}
            onChange={(updates) => setNewStation((s) => ({ ...s, ...updates }))}
            onDelete={() => setAdding(false)}
            deviceId={deviceId}
          />
          <button
            onClick={addStation}
            disabled={!newStation.stopId}
            className="mt-3 w-full bg-[#cc2200] hover:bg-[#aa1800] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg py-2"
          >
            Hinzufügen
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-[#ddd] dark:border-[#2e2e2e] text-[#aaa] dark:text-[#888] hover:border-[#cc2200] hover:text-[#cc2200] rounded-[14px] py-4 text-xs font-semibold transition-colors"
        >
          + Haltestelle hinzufügen
        </button>
      )}
    </div>
  )
}

