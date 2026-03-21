'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseGedcom } from '@/lib/parseGedcom'

const ADMIN_EMAIL = 'nataliabern2007nb@gmail.com'

type ImportStatus = 'idle' | 'parsing' | 'previewing' | 'importing' | 'done' | 'error'

export default function ImportPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ persons: number; families: number; skipped: number } | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' })
  const [gedcomData, setGedcomData] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Check auth on mount
  useState(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      if (data.user.email !== ADMIN_EMAIL) { router.replace('/tree'); return }
      setUserId(data.user.id)
      setIsAdmin(true)
    })
  })

  const handleFile = async (file: File) => {
    setStatus('parsing')
    setError('')
    try {
      const text = await file.text()
      const data = parseGedcom(text)
      setGedcomData(data)

      // Preview: check how many already exist
      const supabase = createClient()
      const { data: existing } = await supabase.from('members').select('name, birth_year')
      const existingSet = new Set(
        (existing ?? []).map((m: any) => `${m.name?.toLowerCase()}|${m.birth_year ?? ''}`)
      )
      let skipped = 0
      for (const p of data.persons) {
        const key = `${p.name.toLowerCase()}|${p.birthYear ?? ''}`
        if (existingSet.has(key)) skipped++
      }

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
      // Load existing members to check duplicates
      const { data: existing } = await supabase.from('members').select('id, name, birth_year')
      const existingMap = new Map<string, string>() // key -> id
      ;(existing ?? []).forEach((m: any) => {
        existingMap.set(`${m.name?.toLowerCase()}|${m.birth_year ?? ''}`, m.id)
      })

      // Map GEDCOM id -> Supabase id
      const idMap = new Map<string, string>()

      // Insert persons
      const { persons, families } = gedcomData
      const toInsert = persons.filter((p: any) => {
        const key = `${p.name.toLowerCase()}|${p.birthYear ?? ''}`
        if (existingMap.has(key)) {
          idMap.set(p.id, existingMap.get(key)!)
          return false
        }
        return true
      })

      setProgress({ current: 0, total: toInsert.length + families.length, label: 'Adding people…' })

      // Batch insert in chunks of 50
      const CHUNK = 50
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK).map((p: any) => ({
          user_id: userId,
          name: p.name,
          birth_year: p.birthYear,
          birth_date: p.birthDate || null,
          death_year: p.deathYear,
          death_date: p.deathDate || null,
          is_deceased: p.isDeceased || !!p.deathYear || !!p.deathDate,
          birthplace: p.birthPlace || null,
          deathplace: p.deathPlace || null,
          notes: p.notes.join('\n\n') || null,
          social_links: [],
          position_x: Math.random() * 2000 - 1000,
          position_y: Math.random() * 2000 - 1000,
          is_root: false,
        }))

        const { data: inserted, error: insertError } = await supabase
          .from('members').insert(chunk).select('id, name, birth_year')

        if (insertError) throw insertError

        // Map GEDCOM ids to new Supabase ids
        inserted?.forEach((ins: any, idx: number) => {
          idMap.set(toInsert[i + idx].id, ins.id)
        })

        setProgress(p => ({ ...p, current: Math.min(i + CHUNK, toInsert.length), label: 'Adding people…' }))
      }

      // Insert relationships from families
      setProgress(p => ({ ...p, label: 'Adding relationships…' }))
      const relationships: any[] = []

      for (const fam of families) {
        const husbId = fam.husbandId ? idMap.get(fam.husbandId) : null
        const wifeId = fam.wifeId ? idMap.get(fam.wifeId) : null

        if (husbId && wifeId) {
          relationships.push({ user_id: userId, source_id: husbId, target_id: wifeId, relation_type: 'spouse' })
        }

        for (const childGedId of fam.childIds) {
          const childId = idMap.get(childGedId)
          if (!childId) continue
          if (husbId) relationships.push({ user_id: userId, source_id: husbId, target_id: childId, relation_type: 'parent' })
          if (wifeId) relationships.push({ user_id: userId, source_id: wifeId, target_id: childId, relation_type: 'parent' })
        }
      }

      // Batch insert relationships, skip duplicates
      for (let i = 0; i < relationships.length; i += CHUNK) {
        const chunk = relationships.slice(i, i + CHUNK)
        await supabase.from('relationships').upsert(chunk, { onConflict: 'source_id,target_id,relation_type', ignoreDuplicates: true })
        setProgress(p => ({ ...p, current: toInsert.length + Math.min(i + CHUNK, relationships.length), total: toInsert.length + relationships.length }))
      }

      setStatus('done')
      setProgress({ current: 0, total: 0, label: `Done! Added ${toInsert.length} people and ${relationships.length} relationships.` })
    } catch (e: any) {
      setError(e.message || 'Import failed')
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(28,22,16,0.95)', border: '1px solid #3a3020',
    borderRadius: 14, padding: 32, maxWidth: 560, margin: '0 auto',
    fontFamily: 'Lora, serif', color: '#f5edd8',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0c08', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={inputStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, color: '#c49040', margin: 0 }}>Import GEDCOM</h1>
            <p style={{ fontSize: 13, color: '#b8a882', margin: '4px 0 0', fontStyle: 'italic' }}>From FamilySearch, Ancestry, or any genealogy software</p>
          </div>
          <button onClick={() => router.push('/tree')} style={{ background: 'none', border: '1px solid #3a3020', borderRadius: 8, color: '#b8a882', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>← Back to Tree</button>
        </div>

        {/* Instructions */}
        <div style={{ background: 'rgba(196,144,64,0.08)', border: '1px solid rgba(196,144,64,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#b8a882', lineHeight: 1.6 }}>
          <strong style={{ color: '#c49040' }}>How to export from FamilySearch:</strong><br />
          1. Go to your tree on FamilySearch<br />
          2. Click a person → <em>Tree Settings</em> → <em>Export</em><br />
          3. Choose <em>Download GEDCOM</em><br />
          4. Upload the <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4 }}>.ged</code> file below
        </div>

        {/* Upload area */}
        {status === 'idle' && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            style={{ border: '2px dashed #3a3020', borderRadius: 12, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 14, color: '#f5edd8', marginBottom: 4 }}>Drop your .ged file here</div>
            <div style={{ fontSize: 12, color: '#b8a882' }}>or click to browse</div>
            <input ref={fileRef} type="file" accept=".ged,.gedcom" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        )}

        {status === 'parsing' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #c49040', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: '#b8a882', fontSize: 13 }}>Reading file…</div>
          </div>
        )}

        {status === 'previewing' && preview && (
          <div>
            <div style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Import Preview</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
              <div style={{ marginTop: 12, fontSize: 12, color: '#b8a882', fontStyle: 'italic' }}>
                {preview.persons - preview.skipped} new people will be added. {preview.skipped} already exist and will be skipped.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setStatus('idle'); setGedcomData(null); setPreview(null) }}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #3a3020', background: 'none', color: '#b8a882', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={runImport}
                style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', cursor: 'pointer', fontSize: 14, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
                Import {preview.persons - preview.skipped} People →
              </button>
            </div>
          </div>
        )}

        {status === 'importing' && (
          <div style={{ padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#b8a882' }}>{progress.label}</span>
              <span style={{ color: '#c49040' }}>{progress.current} / {progress.total}</span>
            </div>
            <div style={{ height: 6, background: '#1a1208', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#c49040', borderRadius: 3, width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {status === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
            <div style={{ fontSize: 16, color: '#c49040', fontFamily: 'Playfair Display, serif', marginBottom: 8 }}>{progress.label}</div>
            <button onClick={() => router.push('/tree')}
              style={{ marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', cursor: 'pointer', fontSize: 14, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
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
