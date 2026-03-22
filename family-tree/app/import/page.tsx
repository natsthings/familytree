'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseGedcom } from '@/lib/parseGedcom'

const ADMIN_EMAIL = 'nataliabern2007nb@gmail.com'

type ImportStatus = 'idle' | 'parsing' | 'previewing' | 'importing' | 'done' | 'error'

// Extract country from a place string like "London, England, United Kingdom" -> "United Kingdom"
// or "Panama City, Panama" -> "Panama"
function extractCountry(place: string | null): string | null {
  if (!place) return null
  const parts = place.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  // Last part is usually country
  const last = parts[parts.length - 1]
  // Filter out things that are clearly not countries (zip codes, "Unknown", etc.)
  if (/^\d+$/.test(last)) return parts[parts.length - 2] ?? null
  if (last.toLowerCase() === 'unknown' || last.toLowerCase() === 'usa') return 'United States'
  if (last.toLowerCase() === 'uk') return 'United Kingdom'
  return last
}

// Grid layout: place imported people in a clean grid starting from anchor position
function computeImportPositions(
  count: number,
  anchorX: number,
  anchorY: number,
  direction: 'above' | 'below' | 'left' | 'right'
): { x: number; y: number }[] {
  const NODE_W = 240
  const NODE_H = 160
  const H_GAP = 60
  const V_GAP = 80
  const COLS = 6 // nodes per row

  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    let x = anchorX + col * (NODE_W + H_GAP)
    let y = anchorY

    if (direction === 'above') y = anchorY - (row + 1) * (NODE_H + V_GAP)
    else if (direction === 'below') y = anchorY + (row + 1) * (NODE_H + V_GAP)
    else if (direction === 'left') x = anchorX - (row + 1) * (NODE_W + H_GAP) - col * (NODE_W + H_GAP)
    else y = anchorY + row * (NODE_H + V_GAP) // right/default

    positions.push({ x, y })
  }
  return positions
}

export default function ImportPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ persons: number; families: number; skipped: number } | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' })
  const [gedcomData, setGedcomData] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Anchor state
  const [existingMembers, setExistingMembers] = useState<any[]>([])
  const [anchorMemberId, setAnchorMemberId] = useState<string>('')
  const [anchorOffsetX, setAnchorOffsetX] = useState<number>(0)
  const [anchorOffsetY, setAnchorOffsetY] = useState<number>(-2000)
  const [anchorDirection, setAnchorDirection] = useState<'above' | 'below' | 'left' | 'right'>('above')
  const [memberSearch, setMemberSearch] = useState('')
  const [relsOnlyMode, setRelsOnlyMode] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      if (data.user.email !== ADMIN_EMAIL) { router.replace('/tree'); return }
      setUserId(data.user.id)
      // Load existing members for anchor picker
      createClient().from('members').select('id, name, birth_year, position_x, position_y').order('name')
        .then(({ data: mems }) => setExistingMembers(mems ?? []))
    })
  }, [])

  const filteredMembers = existingMembers.filter(m =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  ).slice(0, 10)

  const selectedAnchor = existingMembers.find(m => m.id === anchorMemberId)

  const handleFile = async (file: File) => {
    setStatus('parsing')
    setError('')
    try {
      const text = await file.text()
      const data = parseGedcom(text)
      setGedcomData(data)

      const supabase = createClient()
      const { data: existing } = await supabase.from('members').select('name, birth_year')
      const existingSet = new Set(
        (existing ?? []).map((m: any) => `${m.name?.toLowerCase()}|${m.birth_year ?? ''}`)
      )
      const skipped = 0  // no longer skipping — all will be imported
      setPreview({ persons: data.persons.length, families: data.families.length, skipped })
      setStatus('previewing')
    } catch (e: any) {
      setError(e.message || 'Failed to parse file')
      setStatus('error')
    }
  }

  const runImport = async () => {
    if (!gedcomData || !userId) return
    setStatus('importing')
    setError('')

    const supabase = createClient()

    try {
      const { data: existing } = await supabase.from('members').select('id, name, birth_year, position_x, position_y')
      const existingMap = new Map<string, string>()
      ;(existing ?? []).forEach((m: any) => {
        existingMap.set(`${m.name?.toLowerCase()}|${m.birth_year ?? ''}`, m.id)
      })

      // Compute anchor base position
      const anchor = existingMembers.find(m => m.id === anchorMemberId)
      const baseX = (anchor?.position_x ?? 0) + anchorOffsetX
      const baseY = (anchor?.position_y ?? 0) + anchorOffsetY

      const idMap = new Map<string, string>()
      const { persons, families } = gedcomData

      const toInsert = persons.filter((p: any) => {
        const key = `${p.name.toLowerCase()}|${p.birthYear ?? ''}`
        if (existingMap.has(key)) {
          idMap.set(p.id, existingMap.get(key)!)
          return false
        }
        return true
      })

      const CHUNK = 50

      if (!relsOnlyMode) {
        // Normal mode: insert people
        const importPositions = computeImportPositions(toInsert.length, baseX, baseY, anchorDirection)
        setProgress({ current: 0, total: toInsert.length, label: 'Adding people…' })

        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const chunk = toInsert.slice(i, i + CHUNK).map((p: any, idx: number) => {
            const birthCountry = extractCountry(p.birthPlace)
            const deathCountry = extractCountry(p.deathPlace)
            const origins = Array.from(new Set([birthCountry, deathCountry].filter(Boolean))) as string[]
            const pos = importPositions[i + idx] ?? { x: baseX + (i + idx) * 260, y: baseY }
            return {
              user_id: userId, name: p.name,
              birth_year: p.birthYear, birth_date: p.birthDate || null,
              death_year: p.deathYear, death_date: p.deathDate || null,
              is_deceased: p.isDeceased || !!p.deathYear || !!p.deathDate,
              birthplace: p.birthPlace || null, deathplace: p.deathPlace || null,
              notes: p.notes.join('\n\n') || null,
              origins: origins.length > 0 ? origins : null,
              social_links: [], position_x: pos.x, position_y: pos.y, is_root: false,
              familysearch_id: p.fsftId || null,
            }
          })
          const { data: inserted, error: insertError } = await supabase
            .from('members').insert(chunk).select('id, name, birth_year')
          if (insertError) throw insertError
          inserted?.forEach((ins: any, idx: number) => { idMap.set(toInsert[i + idx].id, ins.id) })
          setProgress(p => ({ ...p, current: Math.min(i + CHUNK, toInsert.length), label: 'Adding people…' }))
        }
      } else {
        // Relationships-only mode: load ALL members (just id/name/birth_year) to build ID map
        setProgress({ current: 0, total: 0, label: 'Loading existing members to match…' })
        // Load all members in pages of 1000
        const fsftMap = new Map<string, string>()
        let offset = 0
        let totalLoaded = 0
        while (true) {
          const { data: batch, error: fetchErr } = await supabase
            .from('members')
            .select('id, name, birth_year, familysearch_id')
            .range(offset, offset + 999)
          if (fetchErr) throw new Error('Failed to load members: ' + fetchErr.message)
          if (!batch || batch.length === 0) break
          batch.forEach((m: any) => {
            existingMap.set(`${m.name?.toLowerCase() ?? ''}|${m.birth_year ?? ''}`, m.id)
            if (m.familysearch_id) fsftMap.set(m.familysearch_id, m.id)
          })
          totalLoaded += batch.length
          setProgress({ current: totalLoaded, total: 0, label: `Loading members… ${totalLoaded} loaded` })
          if (batch.length < 1000) break
          offset += 1000
          await new Promise(r => setTimeout(r, 100))
        }
        
        // Match GEDCOM people to Supabase IDs — prefer FamilySearch ID match
        let matched = 0
        persons.forEach((p: any) => {
          let id = p.fsftId ? fsftMap.get(p.fsftId) : undefined
          if (!id) {
            const key = `${p.name.toLowerCase()}|${p.birthYear ?? ''}`
            id = existingMap.get(key)
          }
          if (id) { idMap.set(p.id, id); matched++ }
        })
        // Bulk update familysearch_id for matched members in chunks
        const fsftUpdateList: { supabaseId: string; fsftId: string }[] = []
        persons.forEach((p: any) => {
          const supabaseId = idMap.get(p.id)
          if (supabaseId && p.fsftId) fsftUpdateList.push({ supabaseId, fsftId: p.fsftId })
        })
        // Update in chunks of 50 using Promise.all for speed
        for (let i = 0; i < fsftUpdateList.length; i += 50) {
          const chunk = fsftUpdateList.slice(i, i + 50)
          await Promise.all(chunk.map(u =>
            supabase.from('members').update({ familysearch_id: u.fsftId }).eq('id', u.supabaseId)
          ))
          setProgress({ current: i, total: fsftUpdateList.length, label: `Updating FamilySearch IDs… ${i} of ${fsftUpdateList.length}` })
        }
        
        setProgress({ current: matched, total: persons.length, label: `Matched ${matched} of ${persons.length} people — building relationships…` })
      }

      // Insert relationships
      setProgress(p => ({ ...p, label: 'Adding relationships…' }))
      const relationships: any[] = []

      for (const fam of families) {
        const husbId = fam.husbandId ? idMap.get(fam.husbandId) : null
        const wifeId = fam.wifeId ? idMap.get(fam.wifeId) : null
        if (husbId && wifeId) relationships.push({ user_id: userId, source_id: husbId, target_id: wifeId, relation_type: 'spouse' })

        // Collect all child supabase IDs for this family
        const familyChildIds: string[] = []
        for (const childGedId of fam.childIds) {
          const childId = idMap.get(childGedId)
          if (!childId) continue
          familyChildIds.push(childId)
          if (husbId) relationships.push({ user_id: userId, source_id: husbId, target_id: childId, relation_type: 'parent' })
          if (wifeId) relationships.push({ user_id: userId, source_id: wifeId, target_id: childId, relation_type: 'parent' })
        }

        // Auto-create sibling lines for all children in the same family
        // GEDCOM doesn't store siblings explicitly — we infer from shared parents
        for (let si = 0; si < familyChildIds.length; si++) {
          for (let sj = si + 1; sj < familyChildIds.length; sj++) {
            relationships.push({ user_id: userId, source_id: familyChildIds[si], target_id: familyChildIds[sj], relation_type: 'sibling' })
          }
        }
      }

      // Insert in small batches with retries to avoid rate limits
      const REL_CHUNK = 20
      let totalInserted = 0
      for (let i = 0; i < relationships.length; i += REL_CHUNK) {
        const chunk = relationships.slice(i, i + REL_CHUNK)
        let retries = 3
        while (retries > 0) {
          const { error } = await supabase.from('relationships').upsert(chunk, { onConflict: 'source_id,target_id,relation_type', ignoreDuplicates: true })
          if (!error) { totalInserted += chunk.length; break }
          retries--
          await new Promise(r => setTimeout(r, 1000))
        }
        setProgress({ current: i + REL_CHUNK, total: relationships.length, label: `Saving relationships… ${Math.min(i + REL_CHUNK, relationships.length).toLocaleString()} of ${relationships.length.toLocaleString()}` })
        if (i % 200 === 0 && i > 0) await new Promise(r => setTimeout(r, 300))
      }

      setStatus('done')
      setProgress({ current: 0, total: 0, label: `Done! Built ${totalInserted.toLocaleString()} relationships for ${idMap.size.toLocaleString()} matched people.` })
    } catch (e: any) {
      setError(e.message || 'Import failed')
      setStatus('error')
    }
  }

  const s = {
    page: { minHeight: '100vh', background: '#0f0c08', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px' } as React.CSSProperties,
    card: { background: 'rgba(28,22,16,0.95)', border: '1px solid #3a3020', borderRadius: 14, padding: 32, width: '100%', maxWidth: 580, fontFamily: 'Lora, serif', color: '#f5edd8' } as React.CSSProperties,
    label: { fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase' as const, letterSpacing: '0.1em', display: 'block', marginBottom: 6 },
    input: { width: '100%', background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '8px 12px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, boxSizing: 'border-box' as const },
    section: { marginBottom: 20 } as React.CSSProperties,
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, color: '#c49040', margin: 0 }}>Import</h1>
            <p style={{ fontSize: 13, color: '#b8a882', margin: '4px 0 0', fontStyle: 'italic' }}>Add people from FamilySearch</p>
          </div>
          <button onClick={() => router.push('/tree')} style={{ background: 'none', border: '1px solid #3a3020', borderRadius: 8, color: '#b8a882', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>← Back</button>
        </div>

        {/* FamilySearch API option — hide during import */}
        {status === 'idle' && <div onClick={() => router.push('/import/familysearch')}
          style={{ background: 'rgba(80,112,144,0.1)', border: '1px solid rgba(80,112,144,0.3)', borderRadius: 12, padding: '16px 18px', marginBottom: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 15, color: '#8ab0d0', marginBottom: 4 }}>🔗 Import directly from FamilySearch</div>
            <div style={{ fontSize: 12, color: '#b8a882', lineHeight: 1.5 }}>Connects via API — pulls everything including events, notes, biographies. No file needed. Recommended.</div>
          </div>
          <span style={{ color: '#8ab0d0', fontSize: 20, marginLeft: 12 }}>→</span>
        </div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: '#3a3020' }} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#6a6050', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>or upload a GEDCOM file</span>
          <div style={{ flex: 1, height: 1, background: '#3a3020' }} />
        </div>

        {(status === 'idle' || status === 'previewing') && (
          <>
            {/* Anchor picker */}
            <div style={{ background: 'rgba(196,144,64,0.06)', border: '1px solid rgba(196,144,64,0.2)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 14, color: '#c49040', marginBottom: 12 }}>📍 Placement Anchor</div>
              <p style={{ fontSize: 12, color: '#b8a882', margin: '0 0 14px', lineHeight: 1.6 }}>
                Pick the person in your existing tree who connects to the imported people. Imported members will be placed in a clean grid <strong style={{ color: '#f5edd8' }}>away from your existing tree</strong> — they won't overlap anything you've already done.
              </p>

              <div style={s.section}>
                <label style={s.label}>Bridge person (oldest person you already have)</label>
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search your existing members…"
                  style={s.input}
                />
                {memberSearch && filteredMembers.length > 0 && (
                  <div style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
                    {filteredMembers.map(m => (
                      <button key={m.id} onClick={() => { setAnchorMemberId(m.id); setMemberSearch(m.name) }}
                        style={{ display: 'block', width: '100%', padding: '8px 12px', background: anchorMemberId === m.id ? 'rgba(196,144,64,0.1)' : 'none', border: 'none', borderBottom: '1px solid #1a1208', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                        {m.name} {m.birth_year ? `(b. ${m.birth_year})` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {selectedAnchor && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#c49040' }}>
                    ✓ {selectedAnchor.name} selected — imports will be placed relative to their position
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={s.label}>Direction from bridge person</label>
                  <select value={anchorDirection} onChange={e => setAnchorDirection(e.target.value as any)}
                    style={{ ...s.input }}>
                    <option value="above">Above (ancestors)</option>
                    <option value="below">Below (descendants)</option>
                    <option value="left">To the left</option>
                    <option value="right">To the right</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>Extra spacing (pixels)</label>
                  <input type="number" value={Math.abs(anchorOffsetY)} onChange={e => {
                    const v = parseInt(e.target.value) || 2000
                    setAnchorOffsetY(anchorDirection === 'above' ? -v : v)
                  }} style={s.input} step={200} min={500} />
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#6a6050', fontStyle: 'italic', lineHeight: 1.5 }}>
                💡 The default 2000px gap ensures imported people appear well clear of your existing tree. Increase it if needed.
              </div>
            </div>

            {/* Relationships-only mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: relsOnlyMode ? 'rgba(80,112,144,0.15)' : '#0f0c08', border: `1px solid ${relsOnlyMode ? '#507090' : '#3a3020'}`, borderRadius: 10, marginBottom: 16, cursor: 'pointer' }}
              onClick={() => setRelsOnlyMode(p => !p)}>
              <input type="checkbox" checked={relsOnlyMode} onChange={() => {}} style={{ accentColor: '#507090', width: 16, height: 16, cursor: 'pointer' }} />
              <div>
                <div style={{ fontSize: 13, color: relsOnlyMode ? '#8ab0d0' : '#f5edd8', fontFamily: 'Lora, serif' }}>Relationships only mode</div>
                <div style={{ fontSize: 11, color: '#b8a882', marginTop: 2 }}>Use this if people are already imported — only adds the missing connection lines</div>
              </div>
            </div>

            {/* Upload area */}
            {status === 'idle' && (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{ border: '2px dashed #3a3020', borderRadius: 12, padding: '36px 24px', textAlign: 'center', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 14, color: '#f5edd8', marginBottom: 4 }}>Drop your .ged file here</div>
                <div style={{ fontSize: 12, color: '#b8a882' }}>or click to browse</div>
                <input ref={fileRef} type="file" accept=".ged,.gedcom" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
            )}

            {/* Preview */}
            {status === 'previewing' && preview && (
              <div>
                <div style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Import Preview</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    {[
                      { label: 'People found', value: preview.persons, color: '#c49040' },
                      { label: 'Families', value: preview.families, color: '#507090' },
                      { label: 'Will skip', value: preview.skipped, color: '#b8a882' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 28, fontFamily: 'Playfair Display, serif', color }}>{value}</div>
                        <div style={{ fontSize: 11, color: '#b8a882' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#b8a882', fontStyle: 'italic', borderTop: '1px solid #2a2010', paddingTop: 10 }}>
                    {preview.persons - preview.skipped} new people will be added, placed {anchorDirection} of {selectedAnchor?.name ?? 'the canvas center'} with a {Math.abs(anchorOffsetY)}px gap. Countries will be extracted from birthplaces and added as origins.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setStatus('idle'); setGedcomData(null); setPreview(null) }}
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #3a3020', background: 'none', color: '#b8a882', cursor: 'pointer', fontSize: 13 }}>
                    Cancel
                  </button>
                  <button onClick={runImport}
                    style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', cursor: 'pointer', fontSize: 14, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
                    Import {preview.persons - preview.skipped} People →
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {status === 'parsing' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #c49040', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: '#b8a882', fontSize: 13 }}>Reading file…</div>
          </div>
        )}

        {status === 'importing' && (
          <div style={{ padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#b8a882' }}>{progress.label}</span>
              <span style={{ color: '#c49040' }}>{progress.current} / {progress.total}</span>
            </div>
            <div style={{ height: 8, background: '#1a1208', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #c49040, #e0b060)', borderRadius: 4, width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%', transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#6a6050', marginTop: 8, fontStyle: 'italic' }}>This may take a few minutes for large trees…</div>
          </div>
        )}

        {status === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
            <div style={{ fontSize: 16, color: '#c49040', fontFamily: 'Playfair Display, serif', marginBottom: 8 }}>{progress.label}</div>
            <p style={{ fontSize: 13, color: '#b8a882', fontStyle: 'italic', margin: '0 0 20px' }}>
              Origins have been extracted from birthplaces. Head to the tree to connect the imported people to your existing members.
            </p>
            <button onClick={() => router.push('/tree')}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', cursor: 'pointer', fontSize: 14, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
              Go to Tree →
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ background: 'rgba(139,32,32,0.15)', border: '1px solid rgba(139,32,32,0.3)', borderRadius: 10, padding: '14px 18px', color: '#f87171', fontSize: 13 }}>
            {error}
            <button onClick={() => setStatus('idle')} style={{ display: 'block', marginTop: 10, background: 'none', border: '1px solid rgba(139,32,32,0.3)', borderRadius: 6, color: '#f87171', padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>Try Again</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
