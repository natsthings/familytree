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
  note?: string          // e.g. "burial not recorded"
}

const KIND_META: Record<Kind, { color: string; icon: string; verb: string; toggle: string }> = {
  born:   { color: '#4fa3e0', icon: '👶', verb: 'Born in',  toggle: 'Born' },
  buried: { color: '#b07fd6', icon: '🪦', verb: 'Buried at', toggle: 'Buried' },
  living: { color: '#5fc06a', icon: '🏡', verb: 'Lives in', toggle: 'Living' },
}
const ALL_COLOR = '#c49040'
const CACHE_KEY = 'roots_geocode_v1'
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
          .select('id,name,death_year,death_date,is_deceased,birthplace,deathplace,grave_location,social_links')
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
      if (birth) out.push({ memberId: m.id, name: m.name, kind: 'born', place: birth })

      if (deceased) {
        const grave = (m.grave_location ?? '').trim()
        const death = (m.deathplace ?? '').trim()
        if (grave) out.push({ memberId: m.id, name: m.name, kind: 'buried', place: grave })
        else if (useDeathPlace && death) out.push({ memberId: m.id, name: m.name, kind: 'buried', place: death, note: 'Place of death — burial not recorded' })
      } else {
        const addr = (m.social_links ?? []).find((l: any) => l?.type === 'address' && (l.url ?? '').trim())
        if (addr) out.push({ memberId: m.id, name: m.name, kind: 'living', place: addr.url.trim() })
      }
    }
    return out
  }, [members, useDeathPlace])

  const activeRecords = useMemo(() => records.filter(r => layer === 'all' || r.kind === layer), [records, layer])

  // ---------- geocoding queue (1 request/second, cached in this browser) ----------
  useEffect(() => {
    const needed: string[] = []
    const seen = new Set<string>()
    for (const r of activeRecords) {
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
  }, [activeRecords])

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
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd', maxZoom: 19,
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b8a882', marginLeft: 'auto', cursor: 'pointer' }}>
          <input type="checkbox" checked={useDeathPlace} onChange={e => setUseDeathPlace(e.target.checked)} />
          Use place of death when burial isn’t recorded
        </label>
      </div>

      {/* map */}
      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

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
        {!loading && !pending && placed.length === 0 && (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'rgba(28,22,16,0.95)', border: '1px solid #3a3020', borderRadius: 12, padding: '16px 22px', color: '#b8a882', fontSize: 14, textAlign: 'center', maxWidth: 360 }}>
            No pins for this view yet.<br />
            <span style={{ fontSize: 12 }}>Add a birthplace, a burial location (grave), or an “Address” contact link to a person, and they’ll appear here.</span>
          </div>
        )}

        {/* places that couldn't be found */}
        {unresolved.length > 0 && (
          <div style={{ position: 'absolute', right: 12, bottom: 24, zIndex: 1000, background: 'rgba(28,22,16,0.92)', border: '1px solid #3a3020', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#e8d9b8', maxWidth: 320, maxHeight: '45vh', overflow: 'auto' }}>
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
