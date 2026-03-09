'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface Message {
  id: string
  sender_name: string
  content: string
  created_at: string
}

interface MessageBoxProps {
  memberId: string
  memberName: string
  currentUserId: string
  currentUserName: string
  onClose: () => void
}

export default function MessageBox({ memberId, memberName, currentUserId, currentUserName, onClose }: MessageBoxProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('messages').select('*').eq('member_id', memberId).order('created_at')
      .then(({ data }) => setMessages(data ?? []))

    // Realtime subscription
    const channel = supabase.channel(`messages:${memberId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `member_id=eq.${memberId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message])
      ).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [memberId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!text.trim()) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('messages').insert({
      sender_id: currentUserId,
      sender_name: currentUserName,
      member_id: memberId,
      content: text.trim(),
    })
    setText('')
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#1c1610', border: '1px solid #3a3020', borderRadius: 16, display: 'flex', flexDirection: 'column', maxHeight: '70vh', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #3a3020' }}>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 15, color: '#f5edd8', flex: 1 }}>
            💬 {memberName}'s wall
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <p style={{ fontFamily: 'Lora, serif', fontSize: 12, color: '#b8a882', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>
              No messages yet. Say something! 👋
            </p>
          )}
          {messages.map(m => (
            <div key={m.id} style={{ background: m.sender_name === currentUserName ? 'rgba(196,144,64,0.12)' : '#0f0c08', border: '1px solid #3a3020', borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#c49040', marginBottom: 3 }}>{m.sender_name}</div>
              <div style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8', lineHeight: 1.5 }}>{m.content}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', marginTop: 4 }}>
                {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid #3a3020' }}>
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Leave a message…"
            style={{ flex: 1, background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 8, padding: '8px 12px', color: '#f5edd8', fontFamily: 'Lora, serif', fontSize: 13, outline: 'none' }}
          />
          <button onClick={sendMessage} disabled={loading || !text.trim()}
            style={{ background: '#c49040', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', opacity: loading || !text.trim() ? 0.5 : 1 }}>
            <Send size={14} color="#1a1208" />
          </button>
        </div>
      </div>
    </div>
  )
}
