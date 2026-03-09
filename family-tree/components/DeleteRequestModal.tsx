'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface DeleteRequestModalProps {
  userId: string
  requesterName: string
  targetType: 'member' | 'relationship' | 'scrapbook_item'
  targetId: string
  targetDescription: string
  onClose: () => void
}

export default function DeleteRequestModal({
  userId, requesterName, targetType, targetId, targetDescription, onClose
}: DeleteRequestModalProps) {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('delete_requests').insert({
      requester_id: userId,
      requester_name: requesterName,
      target_type: targetType,
      target_id: targetId,
      target_description: targetDescription,
      status: 'pending',
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#1c1610', border: '1px solid #3a3020', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer' }}>
          <X size={18} />
        </button>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✉️</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f5edd8', marginBottom: 8 }}>Request sent</h2>
            <p style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#b8a882', lineHeight: 1.6 }}>
              Natalia will review your request and take care of it.
            </p>
            <button onClick={onClose} style={{ marginTop: 16, padding: '8px 20px', background: '#c49040', border: 'none', borderRadius: 8, color: '#1a1208', fontFamily: 'Playfair Display, serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f5edd8', marginBottom: 8 }}>
              Request deletion
            </h2>
            <p style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#b8a882', lineHeight: 1.6, marginBottom: 16 }}>
              You're requesting to delete: <strong style={{ color: '#f5edd8' }}>{targetDescription}</strong>
              <br /><br />
              Natalia will review this and remove it if it's correct.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #3a3020', background: 'transparent', color: '#b8a882', fontFamily: 'Lora, serif', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={loading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#c49040', color: '#1a1208', fontFamily: 'Playfair Display, serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
