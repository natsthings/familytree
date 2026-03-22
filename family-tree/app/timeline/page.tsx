'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Major world historical events
const WORLD_EVENTS = [
  // Ancient
  { year: -44, label: 'Julius Caesar assassinated', category: 'politics' },
  { year: 0, label: 'Birth of Jesus Christ', category: 'religion' },
  { year: 79, label: 'Mount Vesuvius erupts — Pompeii buried', category: 'disaster' },
  { year: 117, label: 'Roman Empire at its greatest extent', category: 'politics' },
  { year: 313, label: 'Edict of Milan — Christianity legalized', category: 'religion' },
  { year: 410, label: 'Sack of Rome by Visigoths', category: 'war' },
  { year: 476, label: 'Fall of the Western Roman Empire', category: 'politics' },
  { year: 622, label: 'Muhammad\'s Hijra — Islam begins', category: 'religion' },
  { year: 711, label: 'Moors invade Spain', category: 'war' },
  { year: 800, label: 'Charlemagne crowned Holy Roman Emperor', category: 'politics' },
  { year: 1000, label: 'Vikings reach North America', category: 'exploration' },
  { year: 1066, label: 'Norman Conquest of England', category: 'war' },
  { year: 1095, label: 'First Crusade begins', category: 'war' },
  { year: 1215, label: 'Magna Carta signed', category: 'politics' },
  { year: 1347, label: 'Black Death reaches Europe', category: 'disaster' },
  { year: 1440, label: 'Gutenberg invents printing press', category: 'science' },
  { year: 1453, label: 'Fall of Constantinople', category: 'war' },
  { year: 1492, label: 'Columbus reaches the Americas', category: 'exploration' },
  { year: 1503, label: 'Leonardo paints the Mona Lisa', category: 'culture' },
  { year: 1517, label: 'Martin Luther — Protestant Reformation', category: 'religion' },
  { year: 1519, label: 'Magellan circumnavigates the globe', category: 'exploration' },
  { year: 1521, label: 'Spanish conquer Aztec Empire', category: 'war' },
  { year: 1543, label: 'Copernicus — heliocentric solar system', category: 'science' },
  { year: 1588, label: 'Spanish Armada defeated', category: 'war' },
  { year: 1600, label: 'East India Company founded', category: 'politics' },
  { year: 1607, label: 'Jamestown — first English colony in America', category: 'exploration' },
  { year: 1618, label: 'Thirty Years\' War begins', category: 'war' },
  { year: 1687, label: 'Newton publishes Principia Mathematica', category: 'science' },
  { year: 1692, label: 'Salem Witch Trials', category: 'culture' },
  { year: 1776, label: 'American Declaration of Independence', category: 'politics' },
  { year: 1789, label: 'French Revolution begins', category: 'politics' },
  { year: 1804, label: 'Napoleon crowned Emperor', category: 'politics' },
  { year: 1815, label: 'Battle of Waterloo', category: 'war' },
  { year: 1821, label: 'Panama gains independence from Spain', category: 'politics' },
  { year: 1848, label: 'Year of Revolutions across Europe', category: 'politics' },
  { year: 1859, label: 'Darwin publishes Origin of Species', category: 'science' },
  { year: 1861, label: 'American Civil War begins', category: 'war' },
  { year: 1865, label: 'Slavery abolished in USA', category: 'politics' },
  { year: 1869, label: 'Suez Canal opens', category: 'science' },
  { year: 1876, label: 'Bell invents the telephone', category: 'science' },
  { year: 1888, label: 'Jack the Ripper murders in London', category: 'culture' },
  { year: 1898, label: 'Spanish-American War', category: 'war' },
  { year: 1903, label: 'Wright brothers first flight', category: 'science' },
  { year: 1905, label: 'Einstein publishes Special Relativity', category: 'science' },
  { year: 1914, label: 'World War I begins', category: 'war' },
  { year: 1918, label: 'World War I ends', category: 'war' },
  { year: 1918, label: 'Spanish Flu pandemic', category: 'disaster' },
  { year: 1929, label: 'Great Depression begins', category: 'politics' },
  { year: 1939, label: 'World War II begins', category: 'war' },
  { year: 1945, label: 'World War II ends — atomic bomb dropped', category: 'war' },
  { year: 1948, label: 'State of Israel founded', category: 'politics' },
  { year: 1950, label: 'Korean War begins', category: 'war' },
  { year: 1953, label: 'DNA double helix discovered', category: 'science' },
  { year: 1955, label: 'Rosa Parks — Civil Rights Movement', category: 'politics' },
  { year: 1957, label: 'Sputnik — Space Age begins', category: 'science' },
  { year: 1963, label: 'JFK assassinated', category: 'politics' },
  { year: 1969, label: 'Moon landing', category: 'science' },
  { year: 1989, label: 'Berlin Wall falls', category: 'politics' },
  { year: 1991, label: 'Soviet Union dissolves', category: 'politics' },
  { year: 2001, label: '9/11 attacks', category: 'war' },
  { year: 2008, label: 'Global financial crisis', category: 'politics' },
  { year: 2020, label: 'COVID-19 pandemic', category: 'disaster' },
]

const EVENT_COLORS: Record<string, string> = {
  war: '#8b3030',
  politics: '#507090',
  science: '#407060',
  religion: '#705040',
  exploration: '#604080',
  disaster: '#804030',
  culture: '#606040',
}

interface FamilyMember {
  id: string
  name: string
  birth_year: number | null
  death_year: number | null
  is_deceased: boolean | null
  birthplace: string | null
  photo_url: string | null
}

const CURRENT_YEAR = new Date().getFullYear()

export default function TimelinePage() {
  const router = useRouter()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [viewYear, setViewYear] = useState(1900)
  const [aliveAt, setAliveAt] = useState<number | null>(null)
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null)
  const [showEvents, setShowEvents] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [hoveredEvent, setHoveredEvent] = useState<typeof WORLD_EVENTS[0] | null>(null)
  const [customEvents, setCustomEvents] = useState<any[]>([])
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', year: '', description: '', category: 'personal', member_id: '' })
  const [userId, setUserId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const timelineRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, scrollLeft: 0 })

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
    })
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
    createClient().from('timeline_events').select('*').order('year')
      .then(({ data }) => setCustomEvents(data ?? []))
    createClient().from('members')
      .select('id, name, birth_year, death_year, is_deceased, birthplace, photo_url')
      .then(({ data }) => {
        setMembers((data ?? []).filter((m: any) => m.birth_year))
        setLoading(false)
      })
  }, [])

  // Calculate year range from members
  const years = members.map(m => m.birth_year!).filter(Boolean)
  const minYear = Math.min(...years, -100)
  const maxYear = CURRENT_YEAR
  const yearRange = maxYear - minYear

  // Timeline pixel math
  const PX_PER_YEAR = 8
  const totalWidth = yearRange * PX_PER_YEAR
  const yearToX = (y: number) => (y - minYear) * PX_PER_YEAR

  // Members alive at a given year
  const aliveMembers = aliveAt !== null
    ? members.filter(m => {
        const born = m.birth_year ?? null
        const died = m.death_year ?? (m.is_deceased ? born! + 70 : CURRENT_YEAR)
        return born !== null && born <= aliveAt && died >= aliveAt
      })
    : []

  // Historical context for selected member
  const memberEvents = selectedMember
    ? WORLD_EVENTS.filter(e => {
        const born = selectedMember.birth_year ?? 9999
        const died = selectedMember.death_year ?? (selectedMember.is_deceased ? born + 70 : CURRENT_YEAR)
        return e.year >= born && e.year <= died
      })
    : []

  // Drag to scroll
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    dragStart.current = { x: e.clientX, scrollLeft: timelineRef.current?.scrollLeft ?? 0 }
  }
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !timelineRef.current) return
    timelineRef.current.scrollLeft = dragStart.current.scrollLeft - (e.clientX - dragStart.current.x)
  }, [])
  const onMouseUp = useCallback(() => { isDragging.current = false }, [])
  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [onMouseMove, onMouseUp])

  // Scroll to a year
  const scrollToYear = (year: number) => {
    if (!timelineRef.current) return
    const x = yearToX(year) - timelineRef.current.offsetWidth / 2
    timelineRef.current.scrollTo({ left: x, behavior: 'smooth' })
  }

  const filteredEvents = WORLD_EVENTS.filter(e =>
    filterCategory === 'all' || e.category === filterCategory
  )

  const saveCustomEvent = async () => {
    if (!newEvent.title || !newEvent.year || !userId) return
    const supabase = createClient()
    const { data } = await supabase.from('timeline_events').insert({
      user_id: userId,
      title: newEvent.title,
      year: parseInt(newEvent.year),
      description: newEvent.description || null,
      category: newEvent.category,
      member_id: newEvent.member_id || null,
    }).select().single()
    if (data) {
      setCustomEvents(prev => [...prev, data])
      setNewEvent({ title: '', year: '', description: '', category: 'personal', member_id: '' })
      setShowAddEvent(false)
    }
  }

  const deleteCustomEvent = async (id: string) => {
    await createClient().from('timeline_events').delete().eq('id', id)
    setCustomEvents(prev => prev.filter(e => e.id !== id))
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0c08', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8a882', fontFamily: 'Lora, serif' }}>
      Loading timeline…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f0c08', display: 'flex', flexDirection: 'column', color: '#f5edd8', fontFamily: 'Lora, serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3020', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'rgba(28,22,16,0.95)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => router.push('/tree')} style={{ background: 'none', border: '1px solid #3a3020', borderRadius: 8, color: '#b8a882', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>← Tree</button>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#c49040', margin: 0 }}>Family Timeline</h1>

        {/* Jump to year */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <input type="number" placeholder="Jump to year…" value={viewYear} onChange={e => setViewYear(parseInt(e.target.value) || 0)}
            style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '6px 10px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, width: 120 }} />
          <button onClick={() => scrollToYear(viewYear)} style={{ background: '#c49040', border: 'none', borderRadius: 8, color: '#1a1208', padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>Go</button>
        </div>

        {/* Who was alive when */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" placeholder="Who was alive in…"
            onChange={e => setAliveAt(e.target.value ? parseInt(e.target.value) : null)}
            style={{ background: '#0f0c08', border: '1px solid #507090', borderRadius: 8, padding: '6px 10px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, width: 140 }} />
        </div>

        <button onClick={() => setShowAddEvent(p => !p)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #c49040', background: showAddEvent ? 'rgba(196,144,64,0.15)' : 'none', color: '#c49040', cursor: 'pointer', fontSize: 13, fontFamily: 'Lora, serif' }}>
          + Add Event
        </button>

        {/* Event filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', 'war', 'politics', 'science', 'religion', 'exploration', 'disaster', 'culture'].map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${filterCategory === cat ? (EVENT_COLORS[cat] ?? '#c49040') : '#3a3020'}`, background: filterCategory === cat ? `${EVENT_COLORS[cat] ?? '#c49040'}22` : 'transparent', color: filterCategory === cat ? (EVENT_COLORS[cat] ?? '#c49040') : '#b8a882', cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Alive-at panel */}
      {aliveAt !== null && (
        <div style={{ padding: '12px 24px', background: 'rgba(80,112,144,0.1)', borderBottom: '1px solid rgba(80,112,144,0.3)' }}>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 14, color: '#8ab0d0' }}>
            {aliveMembers.length} family members alive in {aliveAt}:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {aliveMembers.map(m => (
              <button key={m.id} onClick={() => { setSelectedMember(m); scrollToYear(m.birth_year!) }}
                style={{ padding: '4px 10px', background: 'rgba(80,112,144,0.15)', border: '1px solid rgba(80,112,144,0.3)', borderRadius: 20, color: '#8ab0d0', cursor: 'pointer', fontSize: 12, fontFamily: 'Lora, serif' }}>
                {m.name} ({m.birth_year}–{m.death_year ?? (m.is_deceased ? '?' : 'present')})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add custom event panel */}
      {showAddEvent && (
        <div style={{ padding: '16px 24px', background: 'rgba(196,144,64,0.06)', borderBottom: '1px solid rgba(196,144,64,0.2)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', marginBottom: 4 }}>Event title</div>
            <input value={newEvent.title} onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Family emigrated to Panama"
              style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '7px 10px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, width: 220 }} />
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', marginBottom: 4 }}>Year</div>
            <input type="number" value={newEvent.year} onChange={e => setNewEvent(p => ({ ...p, year: e.target.value }))}
              placeholder="e.g. 1920"
              style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '7px 10px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, width: 100 }} />
          </div>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', marginBottom: 4 }}>Category</div>
            <select value={newEvent.category} onChange={e => setNewEvent(p => ({ ...p, category: e.target.value }))}
              style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '7px 10px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13 }}>
              <option value="personal">Personal</option>
              <option value="war">War</option>
              <option value="politics">Politics</option>
              <option value="science">Science</option>
              <option value="religion">Religion</option>
              <option value="culture">Culture</option>
              <option value="disaster">Disaster</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', marginBottom: 4 }}>Description (optional)</div>
            <input value={newEvent.description} onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))}
              placeholder="Add context…"
              style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '7px 10px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, width: '100%' }} />
          </div>
          <button onClick={saveCustomEvent}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', cursor: 'pointer', fontSize: 13, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
            Save Event
          </button>
        </div>
      )}

      {/* Main timeline */}
      <div ref={timelineRef} onMouseDown={onMouseDown}
        style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', cursor: 'grab', position: 'relative', userSelect: 'none' }}>
        <div style={{ width: totalWidth + 200, minHeight: 'calc(100vh - 120px)', position: 'relative', paddingTop: 60 }}>

          {/* Century markers */}
          {Array.from({ length: Math.ceil(yearRange / 100) + 1 }, (_, i) => {
            const y = Math.ceil(minYear / 100) * 100 + i * 100
            if (y > maxYear) return null
            return (
              <div key={y} style={{ position: 'absolute', left: yearToX(y), top: 0, bottom: 0, borderLeft: '1px solid #2a2010', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: 8, left: 4, fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#6a6050', whiteSpace: 'nowrap' }}>
                  {y < 0 ? `${Math.abs(y)} BC` : `${y} AD`}
                </div>
              </div>
            )
          })}

          {/* Decade markers */}
          {Array.from({ length: Math.ceil(yearRange / 10) + 1 }, (_, i) => {
            const y = Math.ceil(minYear / 10) * 10 + i * 10
            if (y % 100 === 0 || y > maxYear) return null
            return (
              <div key={y} style={{ position: 'absolute', left: yearToX(y), top: 40, height: 10, borderLeft: '1px solid #1a1208', pointerEvents: 'none' }} />
            )
          })}

          {/* World events */}
          {showEvents && filteredEvents.map((event, i) => {
            const x = yearToX(event.year)
            const color = EVENT_COLORS[event.category] ?? '#666'
            return (
              <div key={i} style={{ position: 'absolute', left: x, top: 0, bottom: 0, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: 28, left: 0, width: 1, height: 16, background: color, opacity: 0.6 }} />
                <div
                  style={{ position: 'absolute', top: 20, left: -4, width: 8, height: 8, borderRadius: '50%', background: color, cursor: 'pointer', pointerEvents: 'all', zIndex: 5 }}
                  onMouseEnter={e => { setHoveredEvent(event); setTooltipPos({ x: e.clientX, y: e.clientY }) }}
                  onMouseLeave={() => setHoveredEvent(null)}
                />
              </div>
            )
          })}

          {/* Custom events */}
          {customEvents.map((event, i) => {
            const x = yearToX(event.year)
            const color = EVENT_COLORS[event.category] ?? '#c49040'
            return (
              <div key={event.id} style={{ position: 'absolute', left: x, top: 0, bottom: 0, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: 28, left: 0, width: 1, height: 16, background: color, opacity: 0.9 }} />
                <div
                  style={{ position: 'absolute', top: 20, left: -6, width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid #0f0c08', cursor: 'pointer', pointerEvents: 'all', zIndex: 6 }}
                  onMouseEnter={e => { setHoveredEvent({ year: event.year, label: event.title, category: event.category }); setTooltipPos({ x: e.clientX, y: e.clientY }) }}
                  onMouseLeave={() => setHoveredEvent(null)}
                />
              </div>
            )
          })}

          {/* Member lifelines */}
          {members.map((m, rowIndex) => {
            const born = m.birth_year!
            const died = m.death_year ?? (m.is_deceased ? born + 70 : CURRENT_YEAR)
            const x = yearToX(born)
            const width = Math.max((died - born) * PX_PER_YEAR, 4)
            const isSelected = selectedMember?.id === m.id
            const row = rowIndex % 30
            const y = 80 + row * 22

            return (
              <div key={m.id}
                onClick={() => setSelectedMember(isSelected ? null : m)}
                style={{ position: 'absolute', left: x, top: y, width, height: 16, borderRadius: 8,
                  background: isSelected ? '#c49040' : 'rgba(196,144,64,0.25)',
                  border: `1px solid ${isSelected ? '#c49040' : 'rgba(196,144,64,0.4)'}`,
                  cursor: 'pointer', transition: 'background 0.15s', zIndex: isSelected ? 10 : 2 }}
                title={`${m.name} (${born}–${m.death_year ?? (m.is_deceased ? '?' : 'present')})`}
              >
                {width > 80 && (
                  <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: isSelected ? '#1a1208' : '#c49040', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: width - 12, fontFamily: 'Lora, serif' }}>
                    {m.name}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected member detail panel */}
      {selectedMember && (
        <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 320, background: 'rgba(18,14,8,0.97)', borderLeft: '1px solid #3a3020', padding: '20px', overflowY: 'auto', zIndex: 30, backdropFilter: 'blur(8px)' }}>
          <button onClick={() => setSelectedMember(null)} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer', fontSize: 18 }}>✕</button>

          {/* Photo */}
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#3a3020,#252015)', overflow: 'hidden', marginBottom: 12, border: '2px solid #c49040' }}>
            {selectedMember.photo_url
              ? <img src={selectedMember.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#c49040' }}>{selectedMember.name[0]}</div>}
          </div>

          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#c49040', marginBottom: 4 }}>{selectedMember.name}</div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#b8a882', marginBottom: 4 }}>
            {selectedMember.birth_year} – {selectedMember.death_year ?? (selectedMember.is_deceased ? '?' : 'present')}
          </div>
          {selectedMember.birthplace && (
            <div style={{ fontSize: 12, color: '#b8a882', marginBottom: 16, fontStyle: 'italic' }}>📍 {selectedMember.birthplace}</div>
          )}

          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Historical events during their lifetime
          </div>

          {memberEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6a6050', fontStyle: 'italic' }}>No recorded events for this period</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memberEvents.map((e, i) => (
                <div key={i} style={{ padding: '8px 12px', background: `${EVENT_COLORS[e.category]}11`, border: `1px solid ${EVENT_COLORS[e.category]}44`, borderRadius: 8, borderLeft: `3px solid ${EVENT_COLORS[e.category]}` }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: EVENT_COLORS[e.category], marginBottom: 2 }}>
                    {e.year < 0 ? `${Math.abs(e.year)} BC` : e.year} · {e.category}
                  </div>
                  <div style={{ fontSize: 12, color: '#f5edd8', lineHeight: 1.4 }}>{e.label}</div>
                  {selectedMember.birth_year && (
                    <div style={{ fontSize: 10, color: '#6a6050', marginTop: 4, fontStyle: 'italic' }}>
                      {e.year - selectedMember.birth_year > 0
                        ? `When they were ${e.year - selectedMember.birth_year} years old`
                        : `${selectedMember.birth_year - e.year} years before they were born`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button onClick={() => router.push(`/tree`)} style={{ marginTop: 20, width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #3a3020', background: 'none', color: '#b8a882', cursor: 'pointer', fontSize: 13 }}>
            View in Tree →
          </button>
        </div>
      )}

      {/* Event tooltip */}
      {hoveredEvent && (
        <div style={{ position: 'fixed', left: tooltipPos.x + 12, top: tooltipPos.y - 40, zIndex: 100, background: '#1c1610', border: `1px solid ${EVENT_COLORS[hoveredEvent.category]}`, borderRadius: 8, padding: '8px 12px', pointerEvents: 'none', maxWidth: 260 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: EVENT_COLORS[hoveredEvent.category], marginBottom: 3 }}>
            {hoveredEvent.year < 0 ? `${Math.abs(hoveredEvent.year)} BC` : hoveredEvent.year} · {hoveredEvent.category}
          </div>
          <div style={{ fontSize: 13, color: '#f5edd8' }}>{hoveredEvent.label}</div>
        </div>
      )}
    </div>
  )
}
