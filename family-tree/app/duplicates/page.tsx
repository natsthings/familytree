'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Member {
  id: string
  name: string
  birth_year: number | null
  death_year: number | null
  birthplace: string | null
  photo_url: string | null
}

interface DuplicateGroup {
  members: Member[]
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/[^a-z]/g, '')
  const s2 = b.toLowerCase().replace(/[^a-z]/g, '')
  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.85
  // Levenshtein-ish: count matching chars
  let matches = 0
  const shorter = s1.length < s2.length ? s1 : s2
  const longer = s1.length < s2.length ? s2 : s1
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++
  }
  return matches / longer.length
}

function findDuplicates(members: Member[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  const used = new Set<string>()

  for (let i = 0; i < members.length; i++) {
    if (used.has(members[i].id)) continue
    const group: Member[] = [members[i]]
    const m1 = members[i]

    for (let j = i + 1; j < members.length; j++) {
      if (used.has(members[j].id)) continue
      const m2 = members[j]
      const nameSim = similarity(m1.name, m2.name)

      // High confidence: same name + same birth year
      if (nameSim > 0.9 && m1.birth_year && m2.birth_year && m1.birth_year === m2.birth_year) {
        group.push(m2)
        used.add(m2.id)
        continue
      }
      // Medium: very similar name, birth years within 2 years
      if (nameSim > 0.85 && m1.birth_year && m2.birth_year && Math.abs(m1.birth_year - m2.birth_year) <= 2) {
        group.push(m2)
        used.add(m2.id)
        continue
      }
      // Medium: exact name match, no birth years
      if (nameSim > 0.95 && !m1.birth_year && !m2.birth_year) {
        group.push(m2)
        used.add(m2.id)
        continue
      }
    }

    if (group.length > 1) {
      used.add(m1.id)
      const allSameName = group.every(m => similarity(m.name, m1.name) > 0.95)
      const allSameYear = group.every(m => m.birth_year === m1.birth_year)
      const confidence = allSameName && allSameYear ? 'high' : allSameName ? 'medium' : 'low'
      const reason = allSameName && allSameYear
        ? `Same name and birth year (${m1.birth_year})`
        : allSameName ? 'Same or very similar name'
        : 'Similar name and nearby birth year'
      groups.push({ members: group, reason, confidence })
    }
  }

  return groups.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.confidence] - order[b.confidence]
  })
}

const CONFIDENCE_COLORS = {
  high: { bg: 'rgba(139,32,32,0.15)', border: 'rgba(139,32,32,0.4)', text: '#f87171', label: 'High' },
  medium: { bg: 'rgba(196,144,64,0.1)', border: 'rgba(196,144,64,0.3)', text: '#c49040', label: 'Medium' },
  low: { bg: 'rgba(80,112,90,0.1)', border: 'rgba(80,112,90,0.3)', text: '#80b090', label: 'Low' },
}

export default function DuplicatesPage() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
    })
    createClient().from('members').select('id, name, birth_year, death_year, birthplace, photo_url')
      .then(({ data }) => {
        const mems = data ?? []
        setMembers(mems)
        setDuplicates(findDuplicates(mems))
        setLoading(false)
      })
  }, [])

  const handleKeep = async (keepId: string, deleteIds: string[]) => {
    setMerging(keepId)
    const supabase = createClient()
    // Reassign all relationships from deleted members to kept member
    for (const delId of deleteIds) {
      await supabase.from('relationships').update({ source_id: keepId }).eq('source_id', delId)
      await supabase.from('relationships').update({ target_id: keepId }).eq('target_id', delId)
      await supabase.from('scrapbook_items').update({ member_id: keepId }).eq('member_id', delId)
      await supabase.from('member_positions').delete().eq('member_id', delId)
      await supabase.from('members').delete().eq('id', delId)
    }
    setMembers(prev => prev.filter(m => !deleteIds.includes(m.id)))
    setDuplicates(prev => prev.filter(g => !g.members.every(m => m.id === keepId || deleteIds.includes(m.id))))
    setMerging(null)
  }

  const visibleDuplicates = duplicates.filter(g => {
    const key = g.members.map(m => m.id).sort().join(',')
    return !dismissed.has(key)
  })

  const dismiss = (group: DuplicateGroup) => {
    const key = group.members.map(m => m.id).sort().join(',')
    setDismissed(prev => new Set([...Array.from(prev), key]))
  }

  const inp = { background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '8px 12px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13 }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0c08', color: '#f5edd8', fontFamily: 'Lora, serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #3a3020', display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(28,22,16,0.95)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/tree')} style={{ background: 'none', border: '1px solid #3a3020', borderRadius: 8, color: '#b8a882', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>← Tree</button>
        <div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#c49040', margin: 0 }}>Duplicate Detector</h1>
          <p style={{ fontSize: 12, color: '#b8a882', margin: '2px 0 0', fontStyle: 'italic' }}>
            {loading ? 'Scanning…' : `${members.length} people scanned — ${visibleDuplicates.length} potential duplicates found`}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f87171' }} />
          <span style={{ fontSize: 12, color: '#b8a882' }}>High</span>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#c49040', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#b8a882' }}>Medium</span>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#80b090', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#b8a882' }}>Low</span>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#b8a882' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #c49040', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            Scanning for duplicates…
          </div>
        )}

        {!loading && visibleDuplicates.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#c49040', marginBottom: 8 }}>No duplicates found</div>
            <div style={{ fontSize: 14, color: '#b8a882', fontStyle: 'italic' }}>Your tree looks clean!</div>
          </div>
        )}

        {visibleDuplicates.map((group, gi) => {
          const colors = CONFIDENCE_COLORS[group.confidence]
          const groupKey = group.members.map(m => m.id).sort().join(',')
          return (
            <div key={groupKey} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.1em', background: `${colors.border}`, padding: '2px 8px', borderRadius: 20, marginRight: 8 }}>
                    {colors.label} confidence
                  </span>
                  <span style={{ fontSize: 13, color: '#b8a882', fontStyle: 'italic' }}>{group.reason}</span>
                </div>
                <button onClick={() => dismiss(group)} style={{ background: 'none', border: 'none', color: '#6a6050', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}>
                  Not a duplicate
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.members.length}, 1fr)`, gap: 12, marginBottom: 14 }}>
                {group.members.map(m => (
                  <div key={m.id} style={{ background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 10, padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#3a3020,#252015)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#c49040' }}>
                        {m.photo_url ? <img src={m.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name[0]}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 14, color: '#f5edd8' }}>{m.name}</div>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#b8a882' }}>
                          {m.birth_year ? `b. ${m.birth_year}` : 'birth unknown'}
                          {m.death_year ? ` · d. ${m.death_year}` : ''}
                        </div>
                      </div>
                    </div>
                    {m.birthplace && <div style={{ fontSize: 11, color: '#b8a882', fontStyle: 'italic', marginBottom: 10 }}>📍 {m.birthplace}</div>}
                    <button
                      onClick={() => handleKeep(m.id, group.members.filter(o => o.id !== m.id).map(o => o.id))}
                      disabled={merging === m.id}
                      style={{ width: '100%', padding: '7px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', cursor: 'pointer', fontSize: 12, fontFamily: 'Playfair Display, serif', fontWeight: 600, opacity: merging ? 0.6 : 1 }}>
                      {merging === m.id ? 'Merging…' : 'Keep this one'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
