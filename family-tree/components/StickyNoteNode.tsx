'use client'

import { memo, useState, useCallback, useRef } from 'react'
import { NodeProps } from 'reactflow'

interface StickyNoteData {
  content: string
  color: string
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
  isOwner: boolean
}

const COLORS = ['#f5e642', '#f5a623', '#7ed321', '#4a90d9', '#bd10e0', '#ff6b6b', '#b8f5b0']

export default memo(function StickyNoteNode({ id, data }: NodeProps<StickyNoteData>) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(data.content)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const handleDoubleClick = useCallback(() => {
    if (!data.isOwner) return
    setEditing(true)
    setTimeout(() => textRef.current?.focus(), 50)
  }, [data.isOwner])

  const handleBlur = useCallback(() => {
    setEditing(false)
    data.onUpdate(id, content)
  }, [id, content, data])

  const bg = data.color || '#f5e642'
  // Darken the color slightly for the header strip
  const headerBg = bg + 'cc'

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        width: 200, minHeight: 160,
        background: bg,
        borderRadius: 3,
        boxShadow: '3px 4px 12px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        cursor: data.isOwner ? 'grab' : 'default',
        position: 'relative',
        fontFamily: 'Lora, serif',
      }}
    >
      {/* Top strip */}
      <div style={{
        background: headerBg, padding: '5px 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderRadius: '3px 3px 0 0',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', fontFamily: 'DM Mono, monospace' }}>📌 note</span>
        {data.isOwner && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={e => { e.stopPropagation(); setShowColorPicker(p => !p) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '1px 3px', borderRadius: 3, color: 'rgba(0,0,0,0.5)' }}
              title="Change color"
            >🎨</button>
            <button
              onClick={e => { e.stopPropagation(); data.onDelete(id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '1px 3px', borderRadius: 3, color: 'rgba(0,0,0,0.5)' }}
              title="Delete note"
            >✕</button>
          </div>
        )}
      </div>

      {/* Color picker */}
      {showColorPicker && (
        <div style={{
          position: 'absolute', top: 28, right: 4, zIndex: 100,
          background: '#1c1610', border: '1px solid #3a3020', borderRadius: 8,
          padding: 8, display: 'flex', gap: 6,
        }}>
          {COLORS.map(c => (
            <button key={c} onClick={e => { e.stopPropagation(); /* bubble up color change */ data.onUpdate(id, content); setShowColorPicker(false);
              // fire color change via custom event
              window.dispatchEvent(new CustomEvent('sticky-color', { detail: { id, color: c } }))
            }} style={{
              width: 18, height: 18, borderRadius: '50%', background: c,
              border: c === bg ? '2px solid white' : '2px solid transparent', cursor: 'pointer',
            }} />
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, padding: '8px 10px' }}>
        {editing ? (
          <textarea
            ref={textRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onBlur={handleBlur}
            style={{
              width: '100%', height: '100%', minHeight: 110,
              background: 'transparent', border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'Lora, serif', fontSize: 13, color: 'rgba(0,0,0,0.75)',
              lineHeight: 1.5,
            }}
          />
        ) : (
          <div style={{
            fontSize: 13, color: 'rgba(0,0,0,0.75)', lineHeight: 1.5, minHeight: 110,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {content || (data.isOwner ? <span style={{ opacity: 0.4, fontStyle: 'italic' }}>Double-click to write…</span> : '')}
          </div>
        )}
      </div>
    </div>
  )
})
