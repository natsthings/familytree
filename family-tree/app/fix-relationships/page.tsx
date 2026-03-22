'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseGedcom } from '@/lib/parseGedcom'

const ADMIN_EMAIL = 'nataliabern2007nb@gmail.com'

export default function FixIdsPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle'|'running'|'done'|'error'>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' })
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    setStatus('running')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.email !== ADMIN_EMAIL) { router.replace('/tree'); return }

      // Parse GEDCOM to get name -> fsftId mapping
      const text = await file.text()
      const { persons, families } = parseGedcom(text)

      setProgress({ current: 0, total: persons.length, label: 'Parsed GEDCOM, loading DB members…' })

      // Load ALL members from DB in pages
      const nameYearToId = new Map<string, string>()
      let offset = 0
      while (true) {
        const { data: batch } = await supabase.from('members')
          .select('id, name, birth_year')
          .range(offset, offset + 999)
        if (!batch || batch.length === 0) break
        batch.forEach((m: any) => {
          nameYearToId.set(`${m.name?.toLowerCase()}|${m.birth_year ?? ''}`, m.id)
        })
        if (batch.length < 1000) break
        offset += 1000
        setProgress(p => ({ ...p, label: `Loaded ${offset} members from DB…` }))
      }

      setProgress(p => ({ ...p, label: 'Matching and updating FamilySearch IDs…' }))

      // Build updates: match by name+year, set familysearch_id
      const updates: { id: string; fsftId: string }[] = []
      persons.forEach((p: any) => {
        if (!p.fsftId) return
        const key = `${p.name.toLowerCase()}|${p.birthYear ?? ''}`
        const dbId = nameYearToId.get(key)
        if (dbId) updates.push({ id: dbId, fsftId: p.fsftId })
      })

      setProgress({ current: 0, total: updates.length, label: `Matched ${updates.length} people — updating IDs…` })

      // Update in parallel chunks of 50
      const CHUNK = 50
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK)
        await Promise.all(chunk.map(u =>
          supabase.from('members').update({ familysearch_id: u.fsftId }).eq('id', u.id)
        ))
        setProgress({ current: i + CHUNK, total: updates.length, label: `Updated ${Math.min(i + CHUNK, updates.length)} of ${updates.length} FamilySearch IDs…` })
      }

      // Now build relationships using the updated IDs
      setProgress({ current: 0, total: 0, label: 'Building relationships from family data…' })

      // Reload members with their new familysearch_ids
      const fsftToId = new Map<string, string>()
      offset = 0
      while (true) {
        const { data: batch } = await supabase.from('members')
          .select('id, familysearch_id')
          .not('familysearch_id', 'is', null)
          .range(offset, offset + 999)
        if (!batch || batch.length === 0) break
        batch.forEach((m: any) => { if (m.familysearch_id) fsftToId.set(m.familysearch_id, m.id) })
        if (batch.length < 1000) break
        offset += 1000
      }

      // Build ID map from GEDCOM id -> supabase id
      const idMap = new Map<string, string>()
      persons.forEach((p: any) => {
        const supabaseId = p.fsftId ? fsftToId.get(p.fsftId) : undefined
        if (supabaseId) idMap.set(p.id, supabaseId)
      })

      setProgress({ current: idMap.size, total: persons.length, label: `Matched ${idMap.size} people — building relationships…` })

      // Build all relationships
      const userId = user.id
      const relationships: any[] = []
      families.forEach((fam: any) => {
        const husbId = fam.husbandId ? idMap.get(fam.husbandId) : null
        const wifeId = fam.wifeId ? idMap.get(fam.wifeId) : null
        if (husbId && wifeId) relationships.push({ user_id: userId, source_id: husbId, target_id: wifeId, relation_type: 'spouse', is_imported: true })
        const childIds: string[] = []
        fam.childIds.forEach((gedId: string) => {
          const childId = idMap.get(gedId)
          if (!childId) return
          childIds.push(childId)
          if (husbId) relationships.push({ user_id: userId, source_id: husbId, target_id: childId, relation_type: 'parent', is_imported: true })
          if (wifeId) relationships.push({ user_id: userId, source_id: wifeId, target_id: childId, relation_type: 'parent', is_imported: true })
        })
        for (let si = 0; si < childIds.length; si++) {
          for (let sj = si + 1; sj < childIds.length; sj++) {
            relationships.push({ user_id: userId, source_id: childIds[si], target_id: childIds[sj], relation_type: 'sibling', is_imported: true })
          }
        }
      })

      // Insert relationships in small batches
      const REL_CHUNK = 20
      let inserted = 0
      for (let i = 0; i < relationships.length; i += REL_CHUNK) {
        const chunk = relationships.slice(i, i + REL_CHUNK)
        const { error: relErr } = await supabase.from('relationships')
          .upsert(chunk, { onConflict: 'source_id,target_id,relation_type', ignoreDuplicates: true })
        if (!relErr) inserted += chunk.length
        setProgress({ current: i + REL_CHUNK, total: relationships.length, label: `Saving relationships… ${Math.min(i + REL_CHUNK, relationships.length).toLocaleString()} of ${relationships.length.toLocaleString()}` })
        if (i % 200 === 0) await new Promise(r => setTimeout(r, 100))
      }

      setStatus('done')
      setProgress({ current: 0, total: 0, label: `Done! Updated ${updates.length} IDs and built ${inserted.toLocaleString()} relationships.` })
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
      setStatus('error')
    }
  }

  const inp = { background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '8px 12px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13 }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0c08', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'rgba(28,22,16,0.95)', border: '1px solid #3a3020', borderRadius: 14, padding: 32, maxWidth: 520, width: '100%', fontFamily: 'Lora, serif', color: '#f5edd8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#c49040', margin: 0 }}>Fix Relationships</h1>
          <button onClick={() => router.push('/tree')} style={{ background: 'none', border: '1px solid #3a3020', borderRadius: 8, color: '#b8a882', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>← Tree</button>
        </div>

        <p style={{ fontSize: 13, color: '#b8a882', marginBottom: 20, lineHeight: 1.6 }}>
          Upload your .ged file to fix FamilySearch IDs and rebuild all relationship lines for imported members.
        </p>

        {status === 'idle' && (
          <div onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            style={{ border: '2px dashed #3a3020', borderRadius: 12, padding: '40px 24px', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 14, color: '#f5edd8', marginBottom: 4 }}>Drop your .ged file here</div>
            <div style={{ fontSize: 12, color: '#b8a882' }}>or click to browse</div>
            <input ref={fileRef} type="file" accept=".ged,.gedcom" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        )}

        {status === 'running' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#b8a882' }}>{progress.label}</span>
              <span style={{ color: '#c49040' }}>{progress.current > 0 ? `${progress.current.toLocaleString()} / ${progress.total.toLocaleString()}` : ''}</span>
            </div>
            <div style={{ height: 8, background: '#1a1208', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,#c49040,#e0b060)', borderRadius: 4, width: progress.total ? `${Math.min((progress.current/progress.total)*100, 100)}%` : '30%', transition: 'width 0.3s', animation: progress.total ? undefined : 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            <div style={{ fontSize: 11, color: '#6a6050', marginTop: 8, fontStyle: 'italic' }}>This will take several minutes — don't close this tab</div>
          </div>
        )}

        {status === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
            <div style={{ fontSize: 15, color: '#c49040', fontFamily: 'Playfair Display, serif', marginBottom: 16 }}>{progress.label}</div>
            <button onClick={() => router.push('/tree')} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', cursor: 'pointer', fontSize: 14, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
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
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}
