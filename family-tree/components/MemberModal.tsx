'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Trash2, Plus, ExternalLink, Upload } from 'lucide-react'
import { Member, SocialLink, RELATION_LABELS, RelationType } from '@/lib/types'
import { createClient } from '@/lib/supabase'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { useRouter } from 'next/navigation'
import RelationshipPanel from '@/components/RelationshipPanel'

interface MemberModalProps {
  mode: 'add' | 'edit' | 'connect'
  member?: Member | null
  sourceForConnect?: Member | null
  userId: string
  isAdmin?: boolean
  privateMode?: boolean
  onClose: () => void
  onSaved: (deletedMemberId?: string) => void
  onRequestDelete?: (targetId: string, description: string) => void
  pendingTargetId?: string
  allMembers?: Member[]
  allRelationships?: import('@/lib/types').Relationship[]
  currentUserMemberId?: string | null
}

const SOCIAL_TYPES = [
  { value: 'phone', label: 'Phone', icon: '📞' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'address', label: 'Address', icon: '🏠' },
  { value: 'facebook', label: 'Facebook', icon: '📘' },
  { value: 'instagram', label: 'Instagram', icon: '📷' },
  { value: 'obituary', label: 'Obituary', icon: '🕯️' },
  { value: 'website', label: 'Website', icon: '🌐' },
  { value: 'other', label: 'Other', icon: '🔗' },
]

export default function MemberModal({
  mode, member, sourceForConnect, userId, isAdmin = false, privateMode = false, onClose, onSaved, onRequestDelete, pendingTargetId, allMembers, allRelationships = [], currentUserMemberId = null,
}: MemberModalProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(member?.name ?? '')
  const [birthDate, setBirthDate] = useState(member?.birth_date ?? (member?.birth_year ? `${member.birth_year}-01-01` : ''))
  const [deathDate, setDeathDate] = useState(member?.death_date ?? (member?.death_year ? `${member.death_year}-01-01` : ''))
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(member?.social_links ?? [])
  const [photoUrl, setPhotoUrl] = useState(member?.photo_url ?? '')
  const [photoPreview, setPhotoPreview] = useState(member?.photo_url ?? '')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [relationType, setRelationType] = useState<RelationType>('parent')
  const [customLabel, setCustomLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [privateNote, setPrivateNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showRelPanel, setShowRelPanel] = useState(false)

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

  useEffect(() => {
    if (pendingTargetId) { setSelectedExistingId(pendingTargetId); setConnectTo('existing') }
  }, [pendingTargetId])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const url = await uploadToCloudinary(file, `roots/${userId}/profiles`)
      setPhotoUrl(url)
      setPhotoPreview(url)
    } catch (err: any) {
      setError('Photo upload failed: ' + err.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  function addSocialLink() {
    setSocialLinks([...socialLinks, { type: 'other', label: '', url: '' }])
  }
  function updateSocialLink(i: number, field: keyof SocialLink, value: string) {
    const updated = [...socialLinks]
    updated[i] = { ...updated[i], [field]: value }
    setSocialLinks(updated)
  }
  function removeSocialLink(i: number) {
    setSocialLinks(socialLinks.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setLoading(true); setError('')
    const supabase = createClient()
    try {
      if (mode === 'edit' && member) {
        // Always use RPCs so we bypass RLS restrictions
        const { error: nameError } = await supabase.rpc('update_member_details', {
          p_member_id: member.id,
          p_name: name,
          p_photo_url: photoUrl || null,
          p_birth_date: birthDate || null,
          p_death_date: deathDate || null,
          p_birth_year: birthDate ? parseInt(birthDate.split('-')[0]) : null,
          p_death_year: deathDate ? parseInt(deathDate.split('-')[0]) : null,
          p_social_links: JSON.parse(JSON.stringify(socialLinks.filter(l => l.url.trim()))),
        })
        if (nameError) throw nameError
      } else if (mode === 'add') {
        const table = privateMode ? 'private_members' : 'members'
        const { error } = await supabase.from(table as any).insert({
          user_id: userId, name, photo_url: photoUrl || null,
          birth_date: birthDate || null,
          death_date: deathDate || null,
          birth_year: birthDate ? parseInt(birthDate.split('-')[0]) : null,
          death_year: deathDate ? parseInt(deathDate.split('-')[0]) : null,
          social_links: socialLinks.filter(l => l.url.trim()),
          ...(privateMode ? {} : { is_root: false }),
          position_x: 0 + (Math.random() * 100 - 50),
          position_y: 0 + (Math.random() * 100 - 50),
        })
        if (error) throw error
      } else if (mode === 'connect') {
        let targetId = selectedExistingId
        if (connectTo === 'new') {
          const memberTable = privateMode ? 'private_members' : 'members'
          const { data: newMember, error: memberError } = await supabase.from(memberTable as any).insert({
            user_id: userId, name, photo_url: photoUrl || null,
            birth_date: birthDate || null,
            death_date: deathDate || null,
            birth_year: birthDate ? parseInt(birthDate.split('-')[0]) : null,
            death_year: deathDate ? parseInt(deathDate.split('-')[0]) : null,
            social_links: [],
            ...(privateMode ? {} : { is_root: false }),
            position_x: (sourceForConnect?.position_x ?? 0) + (Math.random() * 200 - 100),
            position_y: (sourceForConnect?.position_y ?? 0) + 180,
          }).select().single()
          if (memberError || !newMember) throw memberError
          targetId = newMember.id
        }
        const relTable = privateMode ? 'private_relationships' : 'relationships'
        // Delete any existing relationship between these two nodes first to prevent doubling
        await supabase.from(relTable as any).delete()
          .or(`and(source_id.eq.${sourceForConnect!.id},target_id.eq.${targetId}),and(source_id.eq.${targetId},target_id.eq.${sourceForConnect!.id})`)
        const { error: relError } = await supabase.from(relTable as any).insert({
          user_id: userId, source_id: sourceForConnect!.id, target_id: targetId,
          relation_type: relationType, label: customLabel || null,
        })
        if (relError) throw relError
      }
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!member) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const isPrivateMember = !!(member as any)._isPrivate
    if (isPrivateMember) {
      // Delete from private tables only
      await supabase.from('private_relationships').delete().or(`source_id.eq.${member.id},target_id.eq.${member.id}`)
      const { error } = await supabase.from('private_members').delete().eq('id', member.id)
      if (error) { setError('Delete failed: ' + error.message); setLoading(false); return }
    } else {
      const { error } = await supabase.rpc('delete_member', { member_id: member.id })
      if (error) { setError('Delete failed: ' + error.message); setLoading(false); return }
    }
    onSaved(member.id)
  }

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
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f5edd8', marginBottom: 8 }}>Remove {member.name}?</h2>
            <p style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#b8a882', lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: '#f5edd8' }}>{member.name}</strong> and all their connections. This cannot be undone.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #3a3020', background: 'transparent', color: '#b8a882', fontFamily: 'Lora, serif', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleDelete} disabled={loading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#8b2020', color: '#fff', fontFamily: 'Playfair Display, serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
              {loading ? 'Removing…' : 'Yes, remove'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const title = mode === 'edit' ? `Edit — ${member?.name}` : mode === 'connect' ? isDragConnect ? 'Set relationship' : `Add relative to ${sourceForConnect?.name}` : 'Add family member'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', background: '#1c1610', border: '1px solid #3a3020', borderRadius: 16, padding: 24, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>

        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f5edd8', marginBottom: 20 }}>{title}</h2>

        {error && <div style={{ marginBottom: 16, padding: 12, background: 'rgba(139,32,32,0.3)', border: '1px solid rgba(139,32,32,0.5)', borderRadius: 8, color: '#f87171', fontSize: 13, fontFamily: 'Lora, serif' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Profile photo — edit/add mode */}
          {(mode === 'edit' || (mode === 'connect' && connectTo === 'new') || mode === 'add') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
                  background: photoPreview ? 'transparent' : 'linear-gradient(135deg, #3a3020, #252015)',
                  border: '2px dashed #3a3020', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                  transition: 'border-color 0.2s',
                }}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : uploadingPhoto ? (
                  <div style={{ width: 20, height: 20, border: '2px solid #c49040', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <Upload size={20} color="#b8a882" />
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8', marginBottom: 4 }}>Profile photo</div>
                <div style={{ fontFamily: 'Lora, serif', fontSize: 11, color: '#b8a882', fontStyle: 'italic' }}>Click to upload. More photos go in the scrapbook.</div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
            </div>
          )}

          {/* Connect mode toggle */}
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

          {/* Drag-connect preview */}
          {isDragConnect && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0f0c08', borderRadius: 8, border: '1px solid #3a3020' }}>
              <span style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8' }}>{sourceForConnect?.name}</span>
              <span style={{ color: '#c49040', fontSize: 16 }}>→</span>
              <span style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8' }}>{existingMembers.find(m => m.id === pendingTargetId)?.name ?? '…'}</span>
            </div>
          )}

          {/* Existing picker */}
          {mode === 'connect' && connectTo === 'existing' && !isDragConnect && (
            <div>
              <label style={labelStyle}>Select person</label>
              <select value={selectedExistingId} onChange={e => setSelectedExistingId(e.target.value)} style={inputStyle}>
                <option value="">— choose —</option>
                {existingMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Name */}
          {(mode === 'add' || mode === 'edit' || (mode === 'connect' && connectTo === 'new' && !isDragConnect)) && (
            <div>
              <label style={labelStyle}>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Full name" />
            </div>
          )}

          {(mode === 'add' || mode === 'edit' || (mode === 'connect' && connectTo === 'new' && !isDragConnect)) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Born</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Died</label>
                <input type="date" value={deathDate} onChange={e => setDeathDate(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>
          )}

          {/* Relation type */}
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
          {mode === 'connect' && relationType === 'other' && (
            <div>
              <label style={labelStyle}>Custom label</label>
              <input type="text" value={customLabel} onChange={e => setCustomLabel(e.target.value)} style={inputStyle} placeholder="e.g. Godfather…" />
            </div>
          )}

          {/* Social links — edit mode */}
          {(mode === 'edit' || mode === 'add') && (
            <div>
              <label style={labelStyle}>Contact Info</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {socialLinks.map((link, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={link.type} onChange={e => updateSocialLink(i, 'type', e.target.value)}
                      style={{ ...inputStyle, width: 'auto', padding: '8px 10px', fontSize: 12 }}>
                      {SOCIAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                    <input type={link.type === 'address' || link.type === 'phone' ? 'text' : link.type === 'email' ? 'email' : 'url'} value={link.url} onChange={e => updateSocialLink(i, 'url', e.target.value)}
                      style={{ ...inputStyle, flex: 1, fontSize: 12 }} placeholder={link.type === 'address' ? '123 Main St…' : link.type === 'phone' ? '+1 (555) 000-0000' : link.type === 'email' ? 'email@example.com' : 'https://…'} />
                    <button onClick={() => removeSocialLink(i)} style={{ background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={addSocialLink} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                  background: 'transparent', border: '1px dashed #3a3020', borderRadius: 8,
                  color: '#b8a882', fontFamily: 'Lora, serif', fontSize: 12, cursor: 'pointer',
                }}>
                  <Plus size={12} /> Add contact info (Facebook, address…)
                </button>
              </div>
            </div>
          )}

          {/* Private note — only shown in private mode, edit only */}
          {mode === 'edit' && member && privateMode && (
            <div>
              <label style={{ ...labelStyle, color: '#a060a0' }}>🔒 Private note (only you see this)</label>
              <textarea
                value={privateNote}
                onChange={e => setPrivateNote(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontStyle: 'italic' }}
                placeholder="Private thoughts, notes, context…"
              />
              <button onClick={async () => {
                setSavingNote(true)
                const { createClient: cc } = await import('@/lib/supabase')
                const supabase = cc()
                await supabase.from('private_notes').upsert({ user_id: userId, member_id: member.id, note: privateNote }, { onConflict: 'user_id,member_id' })
                setSavingNote(false)
              }} style={{ marginTop: 6, padding: '5px 12px', background: 'rgba(160,96,160,0.2)', border: '1px solid #806080', borderRadius: 6, color: '#d090d0', fontFamily: 'Lora, serif', fontSize: 12, cursor: 'pointer' }}>
                {savingNote ? 'Saving…' : 'Save note'}
              </button>
            </div>
          )}

          {/* Open scrapbook + relationships — edit mode only */}
          {mode === 'edit' && member && (
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`/scrapbook/${member.id}`}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px', borderRadius: 8,
                  border: '1px solid #c49040', background: 'rgba(196,144,64,0.08)',
                  color: '#c49040', fontFamily: 'Playfair Display, serif',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                📖 Scrapbook
              </a>
              <button
                onClick={() => setShowRelPanel(p => !p)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${showRelPanel ? '#507090' : '#3a3020'}`,
                  background: showRelPanel ? 'rgba(80,112,144,0.15)' : 'transparent',
                  color: showRelPanel ? '#8ab0d0' : '#b8a882',
                  fontFamily: 'Playfair Display, serif', fontSize: 13, fontWeight: 600,
                }}
              >
                🌿 Relationships
              </button>
            </div>
          )}

          {/* Relationship panel */}
          {showRelPanel && mode === 'edit' && member && (
            <RelationshipPanel
              member={member}
              allMembers={allMembers ?? []}
              allRelationships={allRelationships}
              currentUserMemberId={currentUserMemberId}
              onClose={() => setShowRelPanel(false)}
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
          {mode === 'edit' && member && !member.is_root && (
            isAdmin ? (
              <button onClick={() => setShowDeleteConfirm(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                border: '1px solid rgba(139,32,32,0.5)', background: 'rgba(139,32,32,0.15)',
                color: '#f87171', cursor: 'pointer', fontFamily: 'Lora, serif', fontSize: 13,
              }}>
                <Trash2 size={14} /> Remove
              </button>
            ) : (
              <button onClick={() => { onClose(); onRequestDelete?.(member.id, member.name) }} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                border: '1px solid rgba(196,144,64,0.3)', background: 'rgba(196,144,64,0.08)',
                color: '#c49040', cursor: 'pointer', fontFamily: 'Lora, serif', fontSize: 13,
              }}>
                <Trash2 size={14} /> Request removal
              </button>
            )
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
