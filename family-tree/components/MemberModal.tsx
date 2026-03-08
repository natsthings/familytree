'use client'

import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { Member, RELATION_LABELS, RelationType } from '@/lib/types'
import { createClient } from '@/lib/supabase'

interface MemberModalProps {
  mode: 'add' | 'edit' | 'connect'
  member?: Member | null
  sourceForConnect?: Member | null
  userId: string
  onClose: () => void
  onSaved: () => void
  pendingTargetId?: string // pre-filled when user dragged a connection
}

export default function MemberModal({
  mode, member, sourceForConnect, userId, onClose, onSaved, pendingTargetId,
}: MemberModalProps) {
  const [name, setName] = useState(member?.name ?? '')
  const [birthYear, setBirthYear] = useState(member?.birth_year?.toString() ?? '')
  const [deathYear, setDeathYear] = useState(member?.death_year?.toString() ?? '')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [relationType, setRelationType] = useState<RelationType>('parent')
  const [customLabel, setCustomLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // If pendingTargetId is set, we're in drag-connect mode — always "existing"
  const isDragConnect = !!pendingTargetId
  const [connectTo, setConnectTo] = useState<'new' | 'existing'>(isDragConnect ? 'existing' : 'new')
  const [existingMembers, setExistingMembers] = useState<Member[]>([])
  const [selectedExistingId, setSelectedExistingId] = useState(pendingTargetId ?? '')

  useEffect(() => {
    if (mode === 'connect') {
      const supabase = createClient()
      supabase.from('members').select('*').eq('user_id', userId)
        .neq('id', sourceForConnect?.id ?? '').order('name')
        .then(({ data }) => setExistingMembers(data ?? []))
    }
  }, [mode, userId, sourceForConnect])

  // When pendingTargetId arrives (drag connect), pre-select it
  useEffect(() => {
    if (pendingTargetId) {
      setSelectedExistingId(pendingTargetId)
      setConnectTo('existing')
    }
  }, [pendingTargetId])

  async function handleSave() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    try {
      if (mode === 'edit' && member) {
        const { error } = await supabase.from('members').update({
          name,
          birth_year: birthYear ? parseInt(birthYear) : null,
          death_year: deathYear ? parseInt(deathYear) : null,
          notes: notes || null,
        }).eq('id', member.id)
        if (error) throw error

      } else if (mode === 'add') {
        const { error } = await supabase.from('members').insert({
          user_id: userId, name,
          birth_year: birthYear ? parseInt(birthYear) : null,
          death_year: deathYear ? parseInt(deathYear) : null,
          notes: notes || null, is_root: false,
          position_x: Math.random() * 400 - 200,
          position_y: Math.random() * 400 - 200,
        })
        if (error) throw error

      } else if (mode === 'connect') {
        let targetId = selectedExistingId

        if (connectTo === 'new') {
          const { data: newMember, error: memberError } = await supabase.from('members').insert({
            user_id: userId, name,
            birth_year: birthYear ? parseInt(birthYear) : null,
            death_year: deathYear ? parseInt(deathYear) : null,
            notes: notes || null, is_root: false,
            position_x: (sourceForConnect?.position_x ?? 0) + (Math.random() * 200 - 100),
            position_y: (sourceForConnect?.position_y ?? 0) + 180,
          }).select().single()
          if (memberError || !newMember) throw memberError
          targetId = newMember.id
        }

        const { error: relError } = await supabase.from('relationships').insert({
          user_id: userId,
          source_id: sourceForConnect!.id,
          target_id: targetId,
          relation_type: relationType,
          label: customLabel || null,
        })
        if (relError) throw relError
      }
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!member) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('relationships').delete()
      .or(`source_id.eq.${member.id},target_id.eq.${member.id}`)
    await supabase.from('members').delete().eq('id', member.id)
    onSaved()
  }

  const title =
    mode === 'edit' ? `Edit — ${member?.name}`
    : mode === 'connect' ? isDragConnect
      ? `Set relationship`
      : `Add relative to ${sourceForConnect?.name}`
    : 'Add family member'

  const inputStyle = {
    width: '100%', background: '#0f0c08', border: '1px solid #3a3020',
    borderRadius: 8, padding: '10px 14px', color: '#f5edd8',
    fontFamily: 'Lora, serif', fontSize: 14, outline: 'none',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    display: 'block', fontSize: 10, fontFamily: 'DM Mono, monospace',
    color: '#b8a882', textTransform: 'uppercase' as const,
    letterSpacing: '0.1em', marginBottom: 6,
  }

  if (showDeleteConfirm && member) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#1c1610', border: '1px solid #3a3020', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f5edd8', marginBottom: 8 }}>
              Remove {member.name}?
            </h2>
            <p style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#b8a882', lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: '#f5edd8' }}>{member.name}</strong> and all their connections. This cannot be undone.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #3a3020', background: 'transparent', color: '#b8a882', fontFamily: 'Lora, serif', fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={loading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#8b2020', color: '#fff', fontFamily: 'Playfair Display, serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
              {loading ? 'Removing…' : 'Yes, remove'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#1c1610', border: '1px solid #3a3020', borderRadius: 16, padding: 24, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>

        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f5edd8', marginBottom: 4 }}>{title}</h2>
        {isDragConnect && (
          <p style={{ fontFamily: 'Lora, serif', fontSize: 12, color: '#b8a882', fontStyle: 'italic', marginBottom: 16 }}>
            Choose the relationship type for this connection.
          </p>
        )}
        {!isDragConnect && <div style={{ marginBottom: 16 }} />}

        {error && (
          <div style={{ marginBottom: 16, padding: 12, background: 'rgba(139,32,32,0.3)', border: '1px solid rgba(139,32,32,0.5)', borderRadius: 8, color: '#f87171', fontSize: 13, fontFamily: 'Lora, serif' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Connect mode toggle — hidden when drag-connect */}
          {mode === 'connect' && !isDragConnect && (
            <div style={{ display: 'flex', gap: 8 }}>
              {(['new', 'existing'] as const).map((opt) => (
                <button key={opt} onClick={() => setConnectTo(opt)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 13,
                  fontFamily: 'Lora, serif', cursor: 'pointer',
                  background: connectTo === opt ? '#c49040' : 'transparent',
                  color: connectTo === opt ? '#1a1208' : '#b8a882',
                  border: `1px solid ${connectTo === opt ? '#c49040' : '#3a3020'}`,
                  fontWeight: connectTo === opt ? 600 : 400,
                }}>
                  {opt === 'new' ? '+ New person' : 'Link existing'}
                </button>
              ))}
            </div>
          )}

          {/* Show the two connected people when drag-connect */}
          {isDragConnect && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0f0c08', borderRadius: 8, border: '1px solid #3a3020' }}>
              <span style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8' }}>
                {sourceForConnect?.name}
              </span>
              <span style={{ color: '#c49040', fontSize: 16 }}>→</span>
              <span style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8' }}>
                {existingMembers.find(m => m.id === pendingTargetId)?.name ?? '…'}
              </span>
            </div>
          )}

          {/* Existing member picker — shown when not drag-connect and user picks "existing" */}
          {mode === 'connect' && connectTo === 'existing' && !isDragConnect && (
            <div>
              <label style={labelStyle}>Select person</label>
              <select value={selectedExistingId} onChange={e => setSelectedExistingId(e.target.value)} style={inputStyle}>
                <option value="">— choose —</option>
                {existingMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Name — for new person or add mode */}
          {(mode === 'add' || (mode === 'edit') || (mode === 'connect' && connectTo === 'new' && !isDragConnect)) && (
            <div>
              <label style={labelStyle}>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Full name" />
            </div>
          )}

          {/* Years */}
          {(mode === 'add' || mode === 'edit' || (mode === 'connect' && connectTo === 'new' && !isDragConnect)) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Born</label>
                <input type="number" value={birthYear} onChange={e => setBirthYear(e.target.value)} style={inputStyle} placeholder="1950" />
              </div>
              <div>
                <label style={labelStyle}>Died</label>
                <input type="number" value={deathYear} onChange={e => setDeathYear(e.target.value)} style={inputStyle} placeholder="optional" />
              </div>
            </div>
          )}

          {/* Relationship type — for connect mode */}
          {mode === 'connect' && (
            <div>
              <label style={labelStyle}>Relationship type</label>
              <select value={relationType} onChange={e => setRelationType(e.target.value as RelationType)} style={inputStyle}>
                {Object.entries(RELATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Custom label */}
          {mode === 'connect' && relationType === 'other' && (
            <div>
              <label style={labelStyle}>Custom label</label>
              <input type="text" value={customLabel} onChange={e => setCustomLabel(e.target.value)} style={inputStyle} placeholder="e.g. Godfather, Cousin once removed…" />
            </div>
          )}

          {/* Notes */}
          {(mode === 'add' || mode === 'edit') && (
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                style={{ ...inputStyle, resize: 'none' as const }}
                placeholder="Hometown, occupation, stories…" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
          {mode === 'edit' && member && !member.is_root && (
            <button onClick={() => setShowDeleteConfirm(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid rgba(139,32,32,0.5)',
              background: 'rgba(139,32,32,0.15)',
              color: '#f87171', cursor: 'pointer',
              fontFamily: 'Lora, serif', fontSize: 13,
            }}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #3a3020', background: 'transparent', color: '#b8a882', cursor: 'pointer', fontFamily: 'Lora, serif', fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              loading ||
              (mode === 'add' && !name.trim()) ||
              (mode === 'edit' && !name.trim()) ||
              (mode === 'connect' && connectTo === 'new' && !isDragConnect && !name.trim()) ||
              (mode === 'connect' && connectTo === 'existing' && !selectedExistingId)
            }
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', fontFamily: 'Playfair Display, serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? 'Saving…' : mode === 'connect' ? 'Connect' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
