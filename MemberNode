'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Member } from '@/lib/types'

interface MemberNodeData {
  member: Member
  onEdit: (member: Member) => void
  onConnect: (member: Member) => void
}

function MemberNode({ data, selected }: NodeProps<MemberNodeData>) {
  const { member, onEdit, onConnect } = data
  const isDeceased = !!member.death_year

  return (
    <div
      className="member-node"
      style={{
        background: member.is_root
          ? 'linear-gradient(135deg, #3a2c10 0%, #2c1f0e 100%)'
          : 'linear-gradient(135deg, #1e1a12 0%, #16120c 100%)',
        border: selected
          ? '2px solid var(--gold-bright)'
          : member.is_root
          ? '2px solid var(--gold)'
          : '1px solid var(--border)',
        borderRadius: '12px',
        padding: '12px 16px',
        minWidth: '160px',
        maxWidth: '200px',
        cursor: 'pointer',
        boxShadow: selected
          ? '0 0 20px rgba(196, 144, 64, 0.3)'
          : member.is_root
          ? '0 4px 20px rgba(196, 144, 64, 0.15)'
          : '0 2px 8px rgba(0,0,0,0.4)',
        transition: 'all 0.2s ease',
        opacity: isDeceased ? 0.75 : 1,
      }}
      onDoubleClick={() => onEdit(member)}
    >
      {/* Handles for connecting */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {/* Content */}
      <div className="text-center">
        {/* Avatar placeholder */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: member.is_root
              ? 'linear-gradient(135deg, var(--gold), #8a6020)'
              : 'linear-gradient(135deg, #3a3020, #252015)',
            border: `2px solid ${member.is_root ? 'var(--gold)' : 'var(--border)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 8px',
            fontSize: 20,
          }}
        >
          {member.is_root ? '★' : '○'}
        </div>

        <div
          style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: '13px',
            fontWeight: 600,
            color: member.is_root ? 'var(--gold-bright)' : 'var(--parchment)',
            lineHeight: 1.3,
            marginBottom: 3,
          }}
        >
          {member.name}
        </div>

        {(member.birth_year || member.death_year) && (
          <div
            style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: '10px',
              color: 'var(--parchment-dim)',
            }}
          >
            {member.birth_year && member.birth_year}
            {member.birth_year && member.death_year && ' – '}
            {member.death_year && member.death_year}
          </div>
        )}

        {isDeceased && (
          <div style={{ fontSize: 9, color: 'var(--parchment-dim)', marginTop: 2, fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
            † deceased
          </div>
        )}
      </div>

      {/* Quick-connect button */}
      <button
        onClick={(e) => { e.stopPropagation(); onConnect(member) }}
        style={{
          position: 'absolute',
          bottom: -10,
          right: -10,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--gold)',
          border: '2px solid var(--bg)',
          color: 'var(--bark-900)',
          fontSize: 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          lineHeight: 1,
          zIndex: 10,
        }}
        title="Add relative"
      >
        +
      </button>
    </div>
  )
}

export default memo(MemberNode)
