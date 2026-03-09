'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Send, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface Message {
  id: string
  sender_id: string
  sender_name: string
  recipient_id: string
  content: string
  created_at: string
  read: boolean
}

interface Conversation {
  userId: string
  userName: string
  lastMessage: string
  lastAt: string
  unread: number
}

interface MessageBoxProps {
  currentUserId: string
  currentUserName: string
  // If set, open directly to a conversation with this person
  toUserId?: string
  toUserName?: string
  onClose: () => void
}

export default function MessageBox({ currentUserId, currentUserName, toUserId, toUserName, onClose }: MessageBoxProps) {
  const [view, setView] = useState<'inbox' | 'conversation'>(toUserId ? 'conversation' : 'inbox')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeUserId, setActiveUserId] = useState(toUserId ?? '')
  const [activeUserName, setActiveUserName] = useState(toUserName ?? '')
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load inbox (all conversations)
  useEffect(() => {
    if (view !== 'inbox') return
    const supabase = createClient()
    supabase.from('messages').select('*')
      .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        // Group by the other person
        const map: Record<string, Conversation> = {}
        data.forEach((m: Message) => {
          const otherId = m.sender_id === currentUserId ? m.recipient_id : m.sender_id
          const otherName = m.sender_id === currentUserId ? (m as any).recipient_name : m.sender_name
          if (!map[otherId]) {
            map[otherId] = { userId: otherId, userName: otherName, lastMessage: m.content, lastAt: m.created_at, unread: 0 }
          }
          if (!m.read && m.recipient_id === currentUserId) map[otherId].unread++
        })
        setConversations(Object.values(map))
      })
  }, [view, currentUserId])

  // Load conversation messages
  useEffect(() => {
    if (!activeUserId) return
    const supabase = createClient()
    supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${activeUserId}),and(sender_id.eq.${activeUserId},recipient_id.eq.${currentUserId})`)
      .order('created_at')
      .then(({ data }) => {
        setMessages(data ?? [])
        // Mark received messages as read
        supabase.from('messages').update({ read: true })
          .eq('recipient_id', currentUserId).eq('sender_id', activeUserId).eq('read', false)
      })

    // Realtime
    const supabase2 = createClient()
    const channel = supabase2.channel(`dm:${[currentUserId, activeUserId].sort().join(':')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as Message
          if ((m.sender_id === currentUserId && m.recipient_id === activeUserId) ||
              (m.sender_id === activeUserId && m.recipient_id === currentUserId)) {
            setMessages(prev => [...prev, m])
          }
        }
      ).subscribe()
    return () => { supabase2.removeChannel(channel) }
  }, [activeUserId, currentUserId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!text.trim() || !activeUserId) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('messages').insert({
      sender_id: currentUserId,
      sender_name: currentUserName,
      recipient_id: activeUserId,
      recipient_name: activeUserName,
      content: text.trim(),
    })
    setText('')
    setLoading(false)
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#1c1610', border: '1px solid #3a3020', borderRadius: 16, display: 'flex', flexDirection: 'column', height: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #3a3020', gap: 10 }}>
          {view === 'conversation' && (
            <button onClick={() => { setView('inbox'); setActiveUserId(''); setMessages([]) }}
              style={{ background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer', padding: 2 }}>
              <ArrowLeft size={16} />
            </button>
          )}
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 15, color: '#f5edd8', flex: 1 }}>
            {view === 'inbox' ? `💬 Messages${totalUnread > 0 ? ` (${totalUnread})` : ''}` : activeUserName}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Inbox view */}
        {view === 'inbox' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <p style={{ fontFamily: 'Lora, serif', fontSize: 12, color: '#b8a882', fontStyle: 'italic', textAlign: 'center', padding: '40px 20px' }}>
                No messages yet. Click 💬 on a family member's profile to start a conversation.
              </p>
            ) : conversations.map(c => (
              <button key={c.userId} onClick={() => { setActiveUserId(c.userId); setActiveUserName(c.userName); setView('conversation') }}
                style={{ width: '100%', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', borderBottom: '1px solid #3a3020', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #3a3020, #252015)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {c.userName[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8', fontWeight: c.unread > 0 ? 600 : 400 }}>{c.userName}</div>
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 11, color: '#b8a882', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage}</div>
                </div>
                {c.unread > 0 && (
                  <div style={{ background: '#c49040', color: '#1a1208', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontFamily: 'DM Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {c.unread}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Conversation view */}
        {view === 'conversation' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <p style={{ fontFamily: 'Lora, serif', fontSize: 12, color: '#b8a882', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>
                  Start the conversation 👋
                </p>
              )}
              {messages.map(m => {
                const isMine = m.sender_id === currentUserId
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '75%', background: isMine ? 'rgba(196,144,64,0.18)' : '#0f0c08', border: `1px solid ${isMine ? 'rgba(196,144,64,0.3)' : '#3a3020'}`, borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px' }}>
                      <div style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8', lineHeight: 1.5 }}>{m.content}</div>
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', marginTop: 2, paddingInline: 4 }}>
                      {new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid #3a3020' }}>
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={`Message ${activeUserName}…`}
                style={{ flex: 1, background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '8px 12px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, outline: 'none' }}
              />
              <button onClick={sendMessage} disabled={loading || !text.trim()}
                style={{ background: '#c49040', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', opacity: loading || !text.trim() ? 0.5 : 1 }}>
                <Send size={14} color="#1a1208" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
