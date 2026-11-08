'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'

type Kind = 'born' | 'buried' | 'living'
type Layer = Kind | 'all'

interface GeoHit { lat: number; lng: number; label: string; approx: boolean }
interface PlaceRecord {
  memberId: string
  name: string
  kind: Kind
  place: string          // the text exactly as stored on the person
  year: number | null    // birth year (born/living) or death year (buried) — drives the time slider
  note?: string          // e.g. "burial not recorded"
}

const KIND_META: Record<Kind, { color: string; icon: string; verb: string; toggle: string }> = {
  born:   { color: '#4fa3e0', icon: '👶', verb: 'Born in',  toggle: 'Born' },
  buried: { color: '#b07fd6', icon: '🪦', verb: 'Buried at', toggle: 'Buried' },
  living: { color: '#5fc06a', icon: '🏡', verb: 'Lives in', toggle: 'Living' },
}
const ALL_COLOR = '#c49040'
const CACHE_KEY = 'roots_geocode_v1'
const THIS_YEAR = new Date().getFullYear()
const yearOf = (year: any, date: any): number | null => {
  if (typeof year === 'number' && year > 0) return year
  const m = String(date ?? '').match(/\b(1\d{3}|20\d{2})\b/)
  return m ? parseInt(m[1], 10) : null
}
// A curved arc between two points (looks like a flight path, and keeps overlapping lines readable)
function arcPoints(a: [number, number], b: [number, number]): [number, number][] {
  let lng2 = b[1]
  if (lng2 - a[1] > 180) lng2 -= 360
  if (lng2 - a[1] < -180) lng2 += 360
  const dx = lng2 - a[1], dy = b[0] - a[0]
  const cx = (a[1] + lng2) / 2 - dy * 0.2, cy = (a[0] + b[0]) / 2 + dx * 0.2
  const pts: [number, number][] = []
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, u = 1 - t
    pts.push([u * u * a[0] + 2 * u * t * cy + t * t * b[0], u * u * a[1] + 2 * u * t * cx + t * t * lng2])
  }
  return pts
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

function pinHtml(color: string) {
  return `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))">
    <path d="M13 1C6.4 1 1.5 6 1.5 12.4c0 8.6 11.5 22.1 11.5 22.1s11.5-13.5 11.5-22.1C24.5 6 19.6 1 13 1z" fill="${color}" stroke="#0f0c08" stroke-width="1.5"/>
    <circle cx="13" cy="12.5" r="4.5" fill="#0f0c08" fill-opacity=".75"/></svg>`
}

// Look a place up with OpenStreetMap's Nominatim. If the full text finds nothing
// (e.g. a cemetery name), retry with the leading parts dropped and flag it approximate.
async function geocode(text: string): Promise<GeoHit | null> {
  const parts = text.split(',').map(p => p.trim()).filter(Boolean)
  const attempts: { q: string; approx: boolean }[] = [{ q: text, approx: false }]
  if (parts.length >= 3) attempts.push({ q: parts.slice(1).join(', '), approx: true })
  if (parts.length >= 4) attempts.push({ q: parts.slice(2).join(', '), approx: true })

  for (const a of attempts) {
    let data: any[] | null = null
    for (let tries = 0; tries < 2 && data === null; tries++) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(a.q)}`, {
          headers: { 'Accept-Language': 'en' },
        })
        if (res.ok) data = await res.json()
        else await sleep(5000)
      } catch { await sleep(5000) }
    }
    if (data === null) throw new Error('network')   // don't cache a failure caused by the network
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name, approx: a.approx }
    }
    await sleep(1100)
  }
  return null
}

export default function MapPage() {
  const router = useRouter()
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [layer, setLayer] = useState<Layer>('all')
  const [useDeathPlace, setUseDeathPlace] = useState(false)
  const [geoVersion, setGeoVersion] = useState(0)
  const [pending, setPending] = useState(0)
  const [showUnresolved, setShowUnresolved] = useState(false)
  const [year, setYear] = useState(THIS_YEAR)
  const [playing, setPlaying] = useState(false)
  const [hideUndated, setHideUndated] = useState(false)
  const [showLines, setShowLines] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const lineRef = useRef<any>(null)

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const clusterRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const cacheRef = useRef<Record<string, GeoHit | null>>({})
  const queueRef = useRef<string[]>([])
  const runningRef = useRef(false)
  const aliveRef = useRef(true)
  const lastFitKey = useRef('')

  // ---------- load people ----------
  useEffect(() => {
    aliveRef.current = true
    try { cacheRef.current = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { cacheRef.current = {} }
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const all: any[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase.from('members')
          .select('id,name,birth_year,birth_date,death_year,death_date,is_deceased,birthplace,deathplace,grave_location,social_links,photo_url,biography')
          .range(from, from + 999)
        if (error || !data) break
        all.push(...data)
        if (data.length < 1000) break
        from += 1000
      }
      if (!aliveRef.current) return
      setMembers(all)
      setLoading(false)
    })
    return () => { aliveRef.current = false }
  }, [router])

  // ---------- turn people into place records ----------
  const records = useMemo(() => {
    const out: PlaceRecord[] = []
    for (const m of members) {
      const deceased = !!(m.is_deceased || m.death_year || m.death_date)
      const birth = (m.birthplace ?? '').trim()
      const by = yearOf(m.birth_year, m.birth_date)
      const dy = yearOf(m.death_year, m.death_date)
      if (birth) out.push({ memberId: m.id, name: m.name, kind: 'born', place: birth, year: by })

      if (deceased) {
        const grave = (m.grave_location ?? '').trim()
        const death = (m.deathplace ?? '').trim()
        if (grave) out.push({ memberId: m.id, name: m.name, kind: 'buried', place: grave, year: dy })
        else if (useDeathPlace && death) out.push({ memberId: m.id, name: m.name, kind: 'buried', place: death, year: dy, note: 'Place of death — burial not recorded' })
      } else {
        const addr = (m.social_links ?? []).find((l: any) => l?.type === 'address' && (l.url ?? '').trim())
        if (addr) out.push({ memberId: m.id, name: m.name, kind: 'living', place: addr.url.trim(), year: by })
      }
    }
    return out
  }, [members, useDeathPlace])

  const membersById = useMemo(() => new Map<string, any>(members.map(m => [m.id, m])), [members])
  const minYear = useMemo(() => {
    const ys = records.map(r => r.year).filter((y): y is number => y != null)
    return ys.length ? Math.floor(Math.min(...ys) / 10) * 10 : 1800
  }, [records])

  // everything in the chosen toggle (used for looking places up, so scrubbing the slider never waits on a lookup)
  const layerRecords = useMemo(() => records.filter(r => layer === 'all' || r.kind === layer), [records, layer])
  // ...and only the ones that exist yet as of the slider's year
  const inYear = (r: PlaceRecord) => (r.year == null ? !hideUndated : r.year <= year)
  const activeRecords = useMemo(() => layerRecords.filter(inYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layerRecords, year, hideUndated])
  // records that need a geocode: the toggle's pins, plus birth/burial ends when lines are on
  const needRecords = useMemo(() => showLines
    ? [...layerRecords, ...records.filter(r => r.kind !== 'living' && !(layer === 'all' || r.kind === layer))]
    : layerRecords, [layerRecords, records, showLines, layer])

  // ---------- geocoding queue (1 request/second, cached in this browser) ----------
  useEffect(() => {
    const needed: string[] = []
    const seen = new Set<string>()
    for (const r of needRecords) {
      const k = norm(r.place)
      if (!seen.has(k) && !(k in cacheRef.current)) { seen.add(k); needed.push(r.place) }
    }
    queueRef.current = needed
    setPending(needed.length)
    if (runningRef.current || needed.length === 0) return
    runningRef.current = true
    ;(async () => {
      while (aliveRef.current && queueRef.current.length > 0) {
        const text = queueRef.current.shift()!
        const key = norm(text)
        if (key in cacheRef.current) continue
        try {
          cacheRef.current[key] = await geocode(text)
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(cacheRef.current)) } catch {}
          setGeoVersion(v => v + 1)
        } catch { /* network hiccup: skip, it will be retried next visit */ }
        setPending(queueRef.current.length)
        await sleep(1100)
      }
      runningRef.current = false
    })()
  }, [needRecords])

  // ---------- play the slider ----------
  useEffect(() => {
    if (!playing) return
    const step = Math.max(1, Math.round((THIS_YEAR - minYear) / 110))
    const t = setInterval(() => {
      setYear(y => {
        const n = y + step
        if (n >= THIS_YEAR) { setPlaying(false); return THIS_YEAR }
        return n
      })
    }, 140)
    return () => clearInterval(t)
  }, [playing, minYear])

  // ---------- create the map once ----------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      ;(window as any).L = L
      await import('leaflet.markercluster')
      if (cancelled || !mapEl.current || mapRef.current) return
      LRef.current = L
      const map = L.map(mapEl.current, { worldCopyJump: true, minZoom: 2 }).setView([25, 0], 2)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)
      mapRef.current = map
      setMapReady(true)
    })()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; clusterRef.current = null }
    }
  }, [])

  // ---------- draw pins ----------
  const placed = useMemo(() => {
    return activeRecords
      .map(r => ({ r, geo: cacheRef.current[norm(r.place)] }))
      .filter((x): x is { r: PlaceRecord; geo: GeoHit } => !!x.geo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRecords, geoVersion])

  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!mapReady || !L || !map) return
    if (clusterRef.current) map.removeLayer(clusterRef.current)

    const group = (L as any).markerClusterGroup({
      maxClusterRadius: 28,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,       // people at the exact same spot fan out into separate pins
      zoomToBoundsOnClick: true,
      iconCreateFunction: (c: any) => {
        const kinds: string[] = Array.from(new Set<string>(c.getAllChildMarkers().map((m: any) => m.options.kind as string)))
        const color = kinds.length === 1 ? KIND_META[kinds[0] as Kind].color : ALL_COLOR
        return L.divIcon({
          html: `<div style="background:${color};color:#0f0c08;border:2px solid #0f0c08;box-shadow:0 0 0 3px ${color}55;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:600 13px 'DM Mono',monospace">${c.getChildCount()}</div>`,
          className: '', iconSize: [34, 34],
        })
      },
    })

    for (const { r, geo } of placed) {
      const meta = KIND_META[r.kind]
      const marker = L.marker([geo.lat, geo.lng], {
        kind: r.kind,
        icon: L.divIcon({ html: pinHtml(meta.color), className: '', iconSize: [26, 36], iconAnchor: [13, 35], tooltipAnchor: [0, -32] }),
      } as any)
      marker.bindTooltip(
        `<div style="font-family:Lora,serif">
           <div style="font-weight:700;font-size:14px;color:${meta.color}">${esc(r.name)}</div>
           <div style="font-size:12px;margin-top:2px">${meta.icon} ${meta.verb}: ${esc(r.place)}</div>
           ${r.note ? `<div style="font-size:11px;opacity:.75;margin-top:2px">${esc(r.note)}</div>` : ''}
           ${geo.approx ? `<div style="font-size:11px;opacity:.75;margin-top:2px">≈ Approximate — pinned to ${esc(geo.label.split(',').slice(0, 3).join(','))}</div>` : ''}
         </div>`,
        { direction: 'top', className: 'roots-tip', opacity: 1 },
      )
      marker.on('click', () => setSelectedId(r.memberId))
      group.addLayer(marker)
    }
    map.addLayer(group)
    clusterRef.current = group

    // re-fit the view only when the toggle changes (not on every geocode that arrives)
    const fitKey = `${layer}|${useDeathPlace}`
    if (placed.length > 0 && lastFitKey.current !== fitKey) {
      map.fitBounds(group.getBounds().pad(0.15), { maxZoom: 8, animate: true })
      lastFitKey.current = fitKey
    }
  }, [placed, mapReady, layer, useDeathPlace])

  // ---------- birth → burial lines ----------
  const linePairs = useMemo(() => {
    if (!showLines) return []
    const by = new Map<string, { born?: PlaceRecord; buried?: PlaceRecord }>()
    for (const r of records) {
      if (r.kind === 'living') continue
      const e = by.get(r.memberId) ?? {}
      e[r.kind as 'born' | 'buried'] = r
      by.set(r.memberId, e)
    }
    const out: { id: string; name: string; born: PlaceRecord; buried: PlaceRecord; a: GeoHit; b: GeoHit }[] = []
    by.forEach((e, id) => {
      if (!e.born || !e.buried || !inYear(e.born) || !inYear(e.buried)) return
      const a = cacheRef.current[norm(e.born.place)], b = cacheRef.current[norm(e.buried.place)]
      if (!a || !b) return
      if (Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lng - b.lng) < 0.01) return   // same place: nothing to draw
      out.push({ id, name: e.born.name, born: e.born, buried: e.buried, a, b })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLines, records, geoVersion, year, hideUndated])

  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!mapReady || !L || !map) return
    if (lineRef.current) { map.removeLayer(lineRef.current); lineRef.current = null }
    if (linePairs.length === 0) return
    const g = L.layerGroup()
    for (const p of linePairs) {
      const line = L.polyline(arcPoints([p.a.lat, p.a.lng], [p.b.lat, p.b.lng]), { color: ALL_COLOR, weight: 1.8, opacity: 0.7, dashArray: '5 6' })
      line.bindTooltip(
        `<div style="font-family:Lora,serif"><div style="font-weight:700;color:${ALL_COLOR}">${esc(p.name)}</div>
         <div style="font-size:12px;margin-top:2px">${KIND_META.born.icon} ${esc(p.born.place)}</div>
         <div style="font-size:12px">${KIND_META.buried.icon} ${esc(p.buried.place)}</div></div>`,
        { sticky: true, className: 'roots-tip', opacity: 1 })
      line.on('click', () => setSelectedId(p.id))
      g.addLayer(line)
      g.addLayer(L.circleMarker([p.a.lat, p.a.lng], { radius: 4, color: '#0f0c08', weight: 1, fillColor: KIND_META.born.color, fillOpacity: 1, interactive: false }))
      g.addLayer(L.circleMarker([p.b.lat, p.b.lng], { radius: 4, color: '#0f0c08', weight: 1, fillColor: KIND_META.buried.color, fillOpacity: 1, interactive: false }))
    }
    g.addTo(map)
    lineRef.current = g
  }, [linePairs, mapReady])

  // ---------- numbers for the legend ----------
  const stats = useMemo(() => {
    const s: Record<Kind, { total: number; placed: number }> = {
      born: { total: 0, placed: 0 }, buried: { total: 0, placed: 0 }, living: { total: 0, placed: 0 },
    }
    for (const r of records) {
      s[r.kind].total++
      if (cacheRef.current[norm(r.place)]) s[r.kind].placed++
    }
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, geoVersion])

  const unresolved = useMemo(() => {
    return activeRecords.filter(r => cacheRef.current[norm(r.place)] === null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRecords, geoVersion])

  const toggles: { id: Layer; label: string; color: string }[] = [
    { id: 'buried', label: `${KIND_META.buried.icon} Buried`, color: KIND_META.buried.color },
    { id: 'living', label: `${KIND_META.living.icon} Living`, color: KIND_META.living.color },
    { id: 'born',   label: `${KIND_META.born.icon} Born`,   color: KIND_META.born.color },
    { id: 'all',    label: '🌍 All',                          color: ALL_COLOR },
  ]
  const btn = { border: '1px solid #3a3020', borderRadius: 8, padding: '7px 12px', fontFamily: 'Lora, serif', fontSize: 13, cursor: 'pointer' } as const

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0c08' }}>
      <style>{`
        .roots-tip { background:#1c1610 !important; color:#e8d9b8 !important; border:1px solid #3a3020 !important; border-radius:8px !important; padding:8px 10px !important; box-shadow:0 4px 14px rgba(0,0,0,.6) !important; max-width:300px; white-space:normal !important; }
        .roots-tip:before { border-top-color:#3a3020 !important; }
        .leaflet-container { background:#0f0c08; font-family:Lora,serif; }
        .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.6); }
      `}</style>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #3a3020', background: '#1c1610', flexWrap: 'wrap', zIndex: 1000 }}>
        <button onClick={() => router.push('/tree')} style={{ ...btn, background: 'rgba(255,255,255,0.05)', color: '#b8a882' }}>← Tree</button>
        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#e8d9b8', marginRight: 8 }}>Family Map</div>
        {toggles.map(t => {
          const on = layer === t.id
          return (
            <button key={t.id} onClick={() => setLayer(t.id)}
              style={{ ...btn, background: on ? `${t.color}26` : 'rgba(255,255,255,0.05)', color: on ? t.color : '#b8a882', borderColor: on ? t.color : '#3a3020' }}>
              {t.label}
            </button>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b8a882', cursor: 'pointer' }}>
            <input type="checkbox" checked={showLines} onChange={e => setShowLines(e.target.checked)} />
            Lines: birth → burial
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b8a882', cursor: 'pointer' }}>
            <input type="checkbox" checked={useDeathPlace} onChange={e => setUseDeathPlace(e.target.checked)} />
            Use place of death when burial isn’t recorded
          </label>
        </div>
      </div>

      {/* map */}
      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

        {/* year slider */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 24, zIndex: 1000, width: 'min(520px, 42vw)', minWidth: 300, background: 'rgba(28,22,16,0.94)', border: '1px solid #3a3020', borderRadius: 12, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => { if (!playing && year >= THIS_YEAR) setYear(minYear); setPlaying(p => !p) }}
              title={playing ? 'Pause' : 'Play through time'}
              style={{ ...btn, padding: '5px 12px', background: 'rgba(196,144,64,0.15)', color: '#e0b060', borderColor: '#c49040' }}>
              {playing ? '⏸' : '▶'}
            </button>
            <input type="range" min={minYear} max={THIS_YEAR} value={year}
              onChange={e => { setPlaying(false); setYear(parseInt(e.target.value, 10)) }}
              style={{ flex: 1, accentColor: '#c49040' }} />
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, color: '#e0b060', minWidth: 54, textAlign: 'right' }}>
              {year >= THIS_YEAR ? 'Today' : year}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#7a6e55' }}>
            <span>{placed.length} pin{placed.length === 1 ? '' : 's'} as of {year >= THIS_YEAR ? 'today' : year}</span>
            <label style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={hideUndated} onChange={e => setHideUndated(e.target.checked)} style={{ marginRight: 4 }} />
              hide people with no date
            </label>
          </div>
        </div>

        {/* person card (opens when a pin or line is clicked) */}
        {selectedId && membersById.get(selectedId) && (() => {
          const m = membersById.get(selectedId)
          const deceased = !!(m.is_deceased || m.death_year || m.death_date)
          const addr = (m.social_links ?? []).find((l: any) => l?.type === 'address' && (l.url ?? '').trim())
          const rows: [string, string][] = []
          if (m.birthplace) rows.push([`${KIND_META.born.icon} Born`, m.birthplace])
          if (deceased && m.deathplace) rows.push(['✝ Died', m.deathplace])
          if (deceased && m.grave_location) rows.push([`${KIND_META.buried.icon} Buried`, m.grave_location])
          if (!deceased && addr) rows.push([`${KIND_META.living.icon} Lives`, addr.url])
          const bio = (m.biography ?? '').trim()
          return (
            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1100, width: 300, maxHeight: '52vh', overflow: 'auto', background: 'rgba(28,22,16,0.97)', border: '1px solid #c49040', borderRadius: 12, padding: 16, color: '#e8d9b8', boxShadow: '0 8px 30px rgba(0,0,0,.6)' }}>
              <button onClick={() => setSelectedId(null)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#b8a882', fontSize: 18, cursor: 'pointer' }}>×</button>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {m.photo_url
                  ? <img src={m.photo_url} alt={m.name} style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c49040' }} />
                  : <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#3a3020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>}
                <div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 17, fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#b8a882', marginTop: 3 }}>
                    b. {m.birth_date || m.birth_year || '—'}{deceased ? ` · d. ${m.death_date || m.death_year || '—'}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5 }}>
                {rows.map(([k, v], i) => (
                  <div key={i} style={{ marginBottom: 4 }}><span style={{ color: '#b8a882' }}>{k}:</span> {v}</div>
                ))}
                {rows.length === 0 && <div style={{ color: '#7a6e55' }}>No places recorded.</div>}
              </div>
              {bio && <div style={{ marginTop: 8, fontSize: 12, color: '#b8a882', fontStyle: 'italic' }}>{bio.length > 220 ? bio.slice(0, 220) + '…' : bio}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => router.push(`/tree?focus=${selectedId}`)} style={{ ...btn, flex: 1, background: '#c49040', color: '#0f0c08', fontWeight: 600 }}>🌳 Show in tree</button>
                <button onClick={() => router.push(`/scrapbook/${selectedId}`)} style={{ ...btn, flex: 1, background: 'rgba(255,255,255,0.05)', color: '#e8d9b8' }}>📖 Scrapbook</button>
              </div>
            </div>
          )
        })()}

        {/* legend */}
        <div style={{ position: 'absolute', left: 12, bottom: 24, zIndex: 1000, background: 'rgba(28,22,16,0.92)', border: '1px solid #3a3020', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#e8d9b8', minWidth: 190 }}>
          {(['buried', 'living', 'born'] as Kind[]).map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0', opacity: layer === 'all' || layer === k ? 1 : 0.35 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: KIND_META[k].color, display: 'inline-block' }} />
              <span style={{ flex: 1 }}>{KIND_META[k].toggle}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', color: '#b8a882' }}>{stats[k].placed}/{stats[k].total}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, fontSize: 10, color: '#7a6e55' }}>pins placed / people with a place recorded</div>
        </div>

        {/* status */}
        {(loading || pending > 0) && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(28,22,16,0.95)', border: '1px solid #c49040', borderRadius: 20, padding: '6px 16px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#e0b060' }}>
            {loading ? 'Loading family…' : `Finding locations… ${pending} left (saved in this browser, so this only happens once)`}
          </div>
        )}
        {!loading && !pending && placed.length === 0 && !playing && year >= THIS_YEAR && (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'rgba(28,22,16,0.95)', border: '1px solid #3a3020', borderRadius: 12, padding: '16px 22px', color: '#b8a882', fontSize: 14, textAlign: 'center', maxWidth: 360 }}>
            No pins for this view yet.<br />
            <span style={{ fontSize: 12 }}>Add a birthplace, a burial location (grave), or an “Address” contact link to a person, and they’ll appear here.</span>
          </div>
        )}

        {/* places that couldn't be found */}
        {unresolved.length > 0 && (
          <div style={{ position: 'absolute', right: 12, bottom: 24, zIndex: 1000, background: 'rgba(28,22,16,0.92)', border: '1px solid #3a3020', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#e8d9b8', maxWidth: 320, maxHeight: '30vh', overflow: 'auto' }}>
            <div onClick={() => setShowUnresolved(s => !s)} style={{ cursor: 'pointer', color: '#e0b060' }}>
              ⚠️ {unresolved.length} place{unresolved.length === 1 ? '' : 's'} couldn’t be found {showUnresolved ? '▾' : '▸'}
            </div>
            {showUnresolved && unresolved.map((r, i) => (
              <div key={i} style={{ marginTop: 6, fontSize: 11 }}>
                <b>{r.name}</b> <span style={{ color: KIND_META[r.kind].color }}>({KIND_META[r.kind].toggle})</span><br />
                <span style={{ color: '#b8a882' }}>{r.place}</span>
              </div>
            ))}
            {showUnresolved && <div style={{ marginTop: 8, fontSize: 10, color: '#7a6e55' }}>Tip: “City, State, Country” works best.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
