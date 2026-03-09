'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Member, ScrapbookItem, SocialLink } from '@/lib/types'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { ArrowLeft, Plus, Type, Image as ImageIcon, X, ExternalLink, Check } from 'lucide-react'

const SOCIAL_ICONS: Record<string, string> = {
  facebook: '📘', instagram: '📷', obituary: '🕯️', website: '🌐', other: '🔗'
}

// A single draggable scrapbook item
function ScrapItem({
  item, onUpdate, onDelete, selected, onSelect,
}: {
  item: ScrapbookItem
  onUpdate: (id: string, patch: Partial<ScrapbookItem>) => void
  onDelete: (id: string) => void
  selected: boolean
  onSelect: (id: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null)
  const [editingCaption, setEditingCaption] = useState(false)
  const [captionVal, setCaptionVal] = useState(item.caption ?? '')
  const [dateVal, setDateVal] = useState(item.date_taken ?? '')
  const [editingText, setEditingText] = useState(false)
  const [textVal, setTextVal] = useState(item.content)
  const [showMeta, setShowMeta] = useState(false)

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return
    e.preventDefault()
    onSelect(item.id)
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: item.pos_x, oy: item.pos_y }
    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return
      onUpdate(item.id, {
        pos_x: dragStart.current.ox + (ev.clientX - dragStart.current.mx),
        pos_y: dragStart.current.oy + (ev.clientY - dragStart.current.my),
      })
    }
    function onUp() {
      dragStart.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function saveCaption() {
    onUpdate(item.id, { caption: captionVal, date_taken: dateVal || null })
    setEditingCaption(false)
    setShowMeta(false)
  }

  function saveText() {
    onUpdate(item.id, { content: textVal })
    setEditingText(false)
  }

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(item.id) }}
      style={{
        position: 'absolute',
        left: item.pos_x, top: item.pos_y,
        width: item.width,
        transform: `rotate(${item.rotation}deg)`,
        cursor: 'grab',
        userSelect: 'none',
        zIndex: selected ? 20 : 10,
        filter: selected ? 'drop-shadow(0 4px 20px rgba(196,144,64,0.4))' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
        transition: 'filter 0.15s',
      }}
    >
      {/* Photo item */}
      {item.type === 'photo' && (
        <div style={{ background: '#f5edd8', padding: '8px 8px 32px', borderRadius: 2 }}>
          <img src={item.content} alt={item.caption ?? ''} style={{ width: '100%', display: 'block', borderRadius: 1, minHeight: 80, objectFit: 'cover' }} />
          {/* Caption area */}
          {editingCaption ? (
            <div style={{ padding: '4px 0' }}>
              <input value={dateVal} onChange={e => setDateVal(e.target.value)} placeholder="Date (e.g. Summer 1985)" type="text"
                style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #c49040', fontFamily: 'Lora, serif', fontSize: 10, color: '#3a2c10', marginBottom: 4, outline: 'none' }} />
              <textarea value={captionVal} onChange={e => setCaptionVal(e.target.value)} placeholder="Add a caption…" rows={2}
                style={{ width: '100%', background: 'transparent', border: 'none', resize: 'none', fontFamily: 'Lora, serif', fontSize: 11, color: '#3a2c10', outline: 'none', boxSizing: 'border-box' }} />
              <button onClick={saveCaption} style={{ background: '#c49040', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', color: '#1a1208' }}>✓ Done</button>
            </div>
          ) : (
            <div onClick={() => { setEditingCaption(true); setShowMeta(true) }} style={{ cursor: 'text', padding: '4px 0' }}>
              {item.date_taken && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#8a7050', marginBottom: 2 }}>{item.date_taken}</div>}
              <div style={{ fontFamily: 'Lora, serif', fontSize: 11, color: '#3a2c10', fontStyle: 'italic', minHeight: 16 }}>
                {item.caption || <span style={{ opacity: 0.4 }}>Click to add caption…</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Text note item */}
      {item.type === 'text' && (
        <div style={{ background: '#f9f3d4', padding: 14, borderRadius: 2, minHeight: 80, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
          {editingText ? (
            <div>
              <textarea value={textVal} onChange={e => setTextVal(e.target.value)} rows={6} autoFocus
                style={{ width: '100%', background: 'transparent', border: 'none', resize: 'none', fontFamily: 'Lora, serif', fontSize: 13, color: '#3a2c10', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }} />
              <button onClick={saveText} style={{ background: '#c49040', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', color: '#1a1208' }}>✓ Done</button>
            </div>
          ) : (
            <div onClick={() => setEditingText(true)} style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#3a2c10', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 60, cursor: 'text' }}>
              {item.content || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>Click to write…</span>}
            </div>
          )}
        </div>
      )}

      {/* Delete button — shown when selected */}
      {selected && (
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
          style={{
            position: 'absolute', top: -10, right: -10,
            width: 22, height: 22, borderRadius: '50%',
            background: '#8b2020', border: '2px solid #1c1610',
            color: '#fff', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 30,
          }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

export default function ScrapbookPage() {
  const router = useRouter()
  const params = useParams()
  const memberId = params.memberId as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [items, setItems] = useState<ScrapbookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Try refreshing session before giving up
        supabase.auth.refreshSession().then(({ data }) => {
          if (!data.session) { router.replace('/login'); return }
          setUserId(data.session.user.id)
        })
        return
      }
      setUserId(session.user.id)
    })
  }, [router])

  useEffect(() => {
    if (!userId || !memberId) return
    const supabase = createClient()
    Promise.all([
      supabase.from('members').select('*').eq('id', memberId).single(),
      supabase.from('scrapbook_items').select('*').eq('member_id', memberId).order('created_at'),
    ]).then(([{ data: memberData }, { data: itemsData }]) => {
      setMember(memberData)
      setItems(itemsData ?? [])
      setLoading(false)
    })
  }, [userId, memberId])

  // Debounced save of item positions/content — uses RPC so any family member can save
  function scheduleItemSave(updatedItems: ScrapbookItem[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      const supabase = createClient()
      await Promise.all(updatedItems.map(item =>
        supabase.rpc('update_scrapbook_item', {
          item_id: item.id,
          new_pos_x: item.pos_x,
          new_pos_y: item.pos_y,
          new_content: item.content,
          new_caption: item.caption ?? null,
          new_date_taken: item.date_taken ?? null,
        })
      ))
      setSaving(false)
    }, 1000)
  }

  function updateItem(id: string, patch: Partial<ScrapbookItem>) {
    setItems(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, ...patch } : item)
      scheduleItemSave(updated)
      return updated
    })
  }

  async function deleteItem(id: string) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const isAdmin = session?.user?.email?.toLowerCase() === 'nataliabern2007nb@gmail.com'
    if (isAdmin) {
      setItems(prev => prev.filter(i => i.id !== id))
      await supabase.from('scrapbook_items').delete().eq('id', id)
      setSelectedId(null)
    } else {
      // Non-admin: send delete request instead
      const item = items.find(i => i.id === id)
      await supabase.from('delete_requests').insert({
        requester_id: userId,
        requester_name: 'Family member',
        target_type: 'scrapbook_item',
        target_id: id,
        target_description: item?.type === 'photo' ? 'Photo in scrapbook' : `Note: "${item?.content?.slice(0, 40)}…"`,
        status: 'pending',
      })
      alert('Removal request sent to Natalia!')
    }
  }

  async function addTextNote() {
    if (!userId) return
    const supabase = createClient()
    const { data, error } = await supabase.from('scrapbook_items').insert({
      member_id: memberId, user_id: userId,
      type: 'text', content: '',
      pos_x: 100 + Math.random() * 200, pos_y: 100 + Math.random() * 200,
      width: 220, rotation: (Math.random() - 0.5) * 4,
      caption: null, date_taken: null,
    }).select().single()
    if (data) { setItems(prev => [...prev, data]); setSelectedId(data.id) }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file, `roots/${userId}/scrapbook/${memberId}`)
      const supabase = createClient()
      const { data } = await supabase.from('scrapbook_items').insert({
        member_id: memberId, user_id: userId,
        type: 'photo', content: url,
        pos_x: 100 + Math.random() * 300, pos_y: 80 + Math.random() * 200,
        width: 200 + Math.random() * 80, rotation: (Math.random() - 0.5) * 6,
        caption: null, date_taken: null,
      }).select().single()
      if (data) { setItems(prev => [...prev, data]); setSelectedId(data.id) }
    } catch (err: any) {
      console.error('Upload failed:', err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f0c08', color: '#b8a882', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
        Opening scrapbook…
      </div>
    )
  }

  const photoItems = items.filter(i => i.type === 'photo').length
  const textItems = items.filter(i => i.type === 'text').length

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#1a1208', position: 'relative', fontFamily: 'Lora, serif' }}>

      {/* Texture overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'400\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'400\' height=\'400\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")', pointerEvents: 'none', zIndex: 0 }} />

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        background: 'linear-gradient(to bottom, rgba(15,10,4,0.97) 0%, rgba(15,10,4,0) 100%)',
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Lora, serif', fontSize: 13 }}>
          <ArrowLeft size={16} /> Back to tree
        </button>

        <div style={{ width: 1, height: 20, background: '#3a3020' }} />

        {/* Member info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {member?.photo_url && (
            <img src={member.photo_url} alt={member?.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #c49040' }} />
          )}
          <div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 16, color: '#f5edd8', fontWeight: 600 }}>{member?.name}</div>
            {(member?.birth_year || member?.death_year) && (
              <div style={{ fontSize: 10, color: '#b8a882', fontFamily: 'DM Mono, monospace' }}>
                {member?.birth_year ?? '?'}{member?.death_year ? ` – ${member.death_year}` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Social links */}
        {member?.social_links && member.social_links.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
            {member.social_links.map((link, i) => (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'rgba(196,144,64,0.1)', border: '1px solid #3a3020', borderRadius: 6, color: '#b8a882', fontSize: 11, textDecoration: 'none' }}
                title={link.url}>
                <span>{SOCIAL_ICONS[link.type] ?? '🔗'}</span>
                <span>{link.label || link.type}</span>
                <ExternalLink size={9} />
              </a>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {saving && <span style={{ fontSize: 11, color: '#b8a882', fontFamily: 'DM Mono, monospace' }}>saving…</span>}

        {/* Add buttons */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#c49040', border: 'none', borderRadius: 8, color: '#1a1208', fontFamily: 'Playfair Display, serif', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}
        >
          <ImageIcon size={13} /> {uploading ? 'Uploading…' : 'Add photo'}
        </button>
        <button
          onClick={addTextNote}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', border: '1px solid #3a3020', borderRadius: 8, color: '#b8a882', fontFamily: 'Lora, serif', fontSize: 12, cursor: 'pointer' }}
        >
          <Type size={13} /> Add note
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
      </div>

      {/* Canvas — scrollable */}
      <div
        style={{ position: 'absolute', inset: 0, overflow: 'auto', paddingTop: 60 }}
        onClick={() => setSelectedId(null)}
      >
        <div style={{ position: 'relative', width: 1600, height: 1200, minWidth: '100%', minHeight: '100%' }}>
          {/* Cork/paper background */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 30% 20%, #2a1f0e 0%, #1a1208 60%, #0f0c08 100%)',
          }} />

          {/* Empty state */}
          {items.length === 0 && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📸</div>
              <p style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', color: '#b8a882', fontSize: 16, lineHeight: 1.7 }}>
                {member?.name}'s scrapbook is empty.<br />
                <span style={{ fontSize: 13 }}>Add photos or notes using the buttons above.</span>
              </p>
            </div>
          )}

          {/* Items */}
          {items.map(item => (
            <ScrapItem
              key={item.id}
              item={item}
              onUpdate={updateItem}
              onDelete={deleteItem}
              selected={selectedId === item.id}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      </div>

      {/* Bottom info bar */}
      {items.length > 0 && (
        <div style={{ position: 'absolute', bottom: 16, right: 20, zIndex: 20, fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#b8a882' }}>
          {photoItems} photo{photoItems !== 1 ? 's' : ''} · {textItems} note{textItems !== 1 ? 's' : ''}
          {selectedId && <span style={{ marginLeft: 12, color: '#c49040' }}>· click elsewhere to deselect</span>}
        </div>
      )}
    </div>
  )
}
