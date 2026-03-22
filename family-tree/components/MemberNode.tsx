'use client'

import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Member } from '@/lib/types'

interface MemberNodeData {
  member: Member & { _isPrivate?: boolean }
  currentUserId: string | null
  isAdmin: boolean
  cardSize: 'compact' | 'normal' | 'detailed'
  onEdit: (member: Member) => void
  onConnect: (member: Member) => void
  onMessage: (member: Member) => void
}

const handleStyle = {
  width: 10, height: 10, borderRadius: '50%',
  background: '#c49040', border: '2px solid #0f0c08',
  opacity: 0, transition: 'opacity 0.15s',
}

function MemberNode({ data, selected }: NodeProps<MemberNodeData>) {
  const { member, currentUserId, isAdmin, cardSize = 'normal', onEdit, onConnect, onMessage } = data
  const isDeceased = !!member.death_year || !!member.death_date || !!member.is_deceased
  const isClaimed = !!member.claimed_by
  const isMyProfile = member.claimed_by === currentUserId
  const isPrivate = !!(member as any)._isPrivate
  const [copied, setCopied] = useState(false)

  const isCompact = cardSize === 'compact'
  const isDetailed = cardSize === 'detailed'

  // Sepia filter for deceased members with photos
  const photoFilter = isDeceased && member.photo_url ? 'sepia(60%) contrast(90%) brightness(90%)' : undefined

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(member.name)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div
      className="member-node-wrap"
      style={{
        position: 'relative',
        background: isMyProfile
          ? 'linear-gradient(135deg, #3a2c10 0%, #2c1f0e 100%)'
          : 'linear-gradient(135deg, #1e1a12 0%, #16120c 100%)',
        border: selected
          ? '2px solid #e0b060'
          : isPrivate ? '1px solid #806080'
          : isMyProfile ? '2px solid #c49040'
          : isClaimed ? '1px solid #507040'
          : '1px solid #3a3020',
        borderRadius: '12px',
        padding: isCompact ? '6px 10px' : '12px 16px',
        minWidth: isCompact ? '120px' : '160px',
        maxWidth: isCompact ? '160px' : '200px',
        cursor: 'pointer',
        boxShadow: selected
          ? '0 0 20px rgba(196,144,64,0.3)'
          : isMyProfile ? '0 2px 8px rgba(0,0,0,0.4)'
          : member.is_root ? '0 4px 20px rgba(196,144,64,0.15)' : '0 2px 8px rgba(0,0,0,0.4)',
        transition: 'all 0.2s ease',
        opacity: isDeceased ? 0.85 : 1,
      }}
      onDoubleClick={() => onEdit(member)}
    >
      <Handle id="top" type="target" position={Position.Top}
        style={{ ...handleStyle, top: -6, left: '50%', transform: 'translateX(-50%)' }} />
      <Handle id="bottom" type="source" position={Position.Bottom}
        style={{ ...handleStyle, bottom: -6, left: '50%', transform: 'translateX(-50%)' }} />
      <Handle id="left" type="target" position={Position.Left}
        style={{ ...handleStyle, left: -6, top: '50%', transform: 'translateY(-50%)' }} />
      <Handle id="right" type="source" position={Position.Right}
        style={{ ...handleStyle, right: -6, top: '50%', transform: 'translateY(-50%)' }} />

      <div style={{ textAlign: 'center' }}>
        {/* Avatar — hidden in compact mode */}
        {!isCompact && (
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            overflow: 'hidden',
            background: member.is_root
              ? 'linear-gradient(135deg, #c49040, #8a6020)'
              : 'linear-gradient(135deg, #3a3020, #252015)',
            border: isMyProfile ? '2px solid #c49040' : 'none',
            margin: '0 auto 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>
            {member.photo_url ? (
              <img src={member.photo_url} alt={member.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: photoFilter }} />
            ) : (
              <span>{member.is_root ? '★' : '○'}</span>
            )}
          </div>
        )}

        {/* Name — clickable to copy */}
        <div
          onClick={handleCopyName}
          title="Click to copy name"
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: isCompact ? '11px' : '13px',
            fontWeight: 600,
            color: isMyProfile ? '#e0b060' : '#f5edd8',
            lineHeight: 1.3, marginBottom: 3, cursor: 'copy',
            position: 'relative',
          }}
        >
          {member.name}
          {copied && (
            <span style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', background: '#3a3020', color: '#c49040', fontSize: 9, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', fontFamily: 'DM Mono, monospace', pointerEvents: 'none' }}>
              copied!
            </span>
          )}
        </div>

        {isPrivate && (
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#a060a0', marginBottom: 2 }}>🔒 private</div>
        )}
        {!isPrivate && isClaimed && (
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#607040', marginBottom: 2 }}>✓ joined</div>
        )}

        {/* Dates */}
        {(member.birth_date || member.birth_year || member.death_date || member.death_year || member.is_deceased) && (
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: '#b8a882' }}>
            {'b. '}{member.birth_date
              ? new Date(member.birth_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : member.birth_year ?? '—'}
            {isDeceased && <>{' · d. '}{member.death_date
              ? new Date(member.death_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : member.death_year ?? '—'}</>}
          </div>
        )}

        {isDeceased && !isCompact && (
          <div style={{ fontSize: 9, color: '#b8a882', marginTop: 2, fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
            † deceased
          </div>
        )}

        {/* Birthplace in detailed mode */}
        {isDetailed && (member as any).birthplace && (
          <div style={{ fontSize: 9, color: '#b8a882', marginTop: 3, fontStyle: 'italic' }}>
            📍 {(member as any).birthplace}
          </div>
        )}

        {/* Origins in detailed mode */}
        {isDetailed && member.origins && member.origins.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
            {member.origins.slice(0, 3).map((o, i) => (
              <span key={i} style={{ fontSize: 8, background: 'rgba(80,112,90,0.2)', border: '1px solid rgba(80,112,90,0.3)', borderRadius: 10, padding: '1px 5px', color: '#80b090' }}>{o}</span>
            ))}
          </div>
        )}

        {/* Social link indicators */}
        {!isCompact && member.social_links && member.social_links.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
            {member.social_links.slice(0, 5).map((link, i) => (
              <span key={i} style={{ fontSize: 9, opacity: 0.7 }}>
                {link.type === 'phone' ? '📞'
                  : link.type === 'email' ? '✉️'
                  : link.type === 'address' ? '🏠'
                  : link.type === 'facebook' ? '📘'
                  : link.type === 'instagram' ? '📷'
                  : link.type === 'obituary' ? '🕯️'
                  : link.type === 'website' ? '🌐'
                  : '🔗'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Message button */}
      {isClaimed && (
        <button
          onClick={(e) => { e.stopPropagation(); onMessage(member) }}
          style={{
            position: 'absolute', top: 6, left: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, opacity: 0.6, padding: 2,
            transition: 'opacity 0.15s',
          }}
          title={`Message ${member.name}`}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        >
          💬
        </button>
      )}

      {/* Add relative button */}
      <button
        onClick={(e) => { e.stopPropagation(); onConnect(member) }}
        style={{
          position: 'absolute', bottom: -10, right: -10,
          width: 20, height: 20, borderRadius: '50%',
          background: '#c49040', border: '2px solid #0f0c08',
          color: '#1a1208', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', lineHeight: 1, zIndex: 10,
        }}
        title="Add relative"
      >
        +
      </button>
    </div>
  )
}

export default memo(MemberNode, (prev, next) => {
  // Re-render if cardSize, member data, or selection changes
  return (
    prev.data.cardSize === next.data.cardSize &&
    prev.data.member === next.data.member &&
    prev.selected === next.selected &&
    prev.data.currentUserId === next.data.currentUserId
  )
})
