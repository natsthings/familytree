'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeChange,
  applyNodeChanges,
  BackgroundVariant,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { createClient } from '@/lib/supabase'
import { Member, Relationship } from '@/lib/types'
import MemberNode from '@/components/MemberNode'
import MemberModal from '@/components/MemberModal'
import { LogOut, Plus, TreePine, Save } from 'lucide-react'

// Debounce utility
function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fn(...args), delay)
    },
    [fn, delay]
  )
}

const nodeTypes = { memberNode: MemberNode }

const EDGE_COLORS: Record<string, string> = {
  parent: '#c49040',
  child: '#c49040',
  spouse: '#b06080',
  sibling: '#507090',
  other: '#607060',
}

const EDGE_LABELS: Record<string, string> = {
  parent: 'parent',
  child: 'child',
  spouse: '♥',
  sibling: 'sibling',
  other: '',
}

export default function TreePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Modal state
  const [modal, setModal] = useState<{
    mode: 'add' | 'edit' | 'connect'
    member?: Member
    sourceForConnect?: Member
  } | null>(null)

  // Auth check
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
      } else {
        setUserId(session.user.id)
      }
    })
  }, [router])

  // Load data
  async function loadData() {
    if (!userId) return
    const supabase = createClient()

    const [{ data: membersData }, { data: relsData }] = await Promise.all([
      supabase.from('members').select('*').eq('user_id', userId),
      supabase.from('relationships').select('*').eq('user_id', userId),
    ])

    setMembers(membersData ?? [])
    setRelationships(relsData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (userId) loadData()
  }, [userId])

  // Build React Flow nodes from members
  useEffect(() => {
    const newNodes: Node[] = members.map((m) => ({
      id: m.id,
      type: 'memberNode',
      position: { x: m.position_x, y: m.position_y },
      data: {
        member: m,
        onEdit: (member: Member) => setModal({ mode: 'edit', member }),
        onConnect: (member: Member) => setModal({ mode: 'connect', sourceForConnect: member }),
      },
    }))
    setNodes(newNodes)
  }, [members])

  // Build edges from relationships
  const edges: Edge[] = useMemo(() => {
    return relationships.map((r) => ({
      id: r.id,
      source: r.source_id,
      target: r.target_id,
      label: r.label || EDGE_LABELS[r.relation_type] || '',
      labelStyle: {
        fill: 'var(--parchment-dim)',
        fontFamily: 'Lora, serif',
        fontSize: 11,
        fontStyle: 'italic',
      },
      labelBgStyle: {
        fill: 'var(--surface)',
        fillOpacity: 0.9,
      },
      style: {
        stroke: EDGE_COLORS[r.relation_type] ?? 'var(--gold)',
        strokeWidth: r.relation_type === 'spouse' ? 2 : 1.5,
        strokeDasharray: r.relation_type === 'spouse' ? '6 3' : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: EDGE_COLORS[r.relation_type] ?? 'var(--gold)',
        width: 12,
        height: 12,
      },
      animated: r.relation_type === 'spouse',
    }))
  }, [relationships])

  // Save positions to Supabase (debounced)
  const savePositions = useDebouncedCallback(
    async (updatedNodes: Node[]) => {
      setSaveStatus('saving')
      const supabase = createClient()
      await Promise.all(
        updatedNodes.map((n) =>
          supabase
            .from('members')
            .update({ position_x: n.position.x, position_y: n.position.y })
            .eq('id', n.id)
        )
      )
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    },
    1200
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds)
        // Only save if positions changed
        const hasMoved = changes.some((c) => c.type === 'position' && c.dragging === false)
        if (hasMoved) savePositions(updated)
        return updated
      })
    },
    [savePositions]
  )

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  function handleModalSaved() {
    setModal(null)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-3">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        <span className="font-body text-[var(--parchment-dim)] italic">Growing your tree…</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          padding: '12px 20px',
          background: 'linear-gradient(to bottom, rgba(15,12,8,0.95) 0%, rgba(15,12,8,0) 100%)',
          pointerEvents: 'none',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
          <TreePine size={22} color="var(--gold)" />
          <span
            style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 20,
              color: 'var(--parchment)',
              fontWeight: 600,
            }}
          >
            Family Tree
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Save status */}
        {saveStatus !== 'idle' && (
          <div
            style={{
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--parchment-dim)',
              fontFamily: 'DM Mono, monospace',
              fontSize: 11,
              marginRight: 16,
            }}
          >
            <Save size={12} />
            {saveStatus === 'saving' ? 'saving…' : '✓ saved'}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button
            onClick={() => setModal({ mode: 'add' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--gold)',
              color: '#1a1208',
              border: 'none',
              borderRadius: 8,
              padding: '7px 14px',
              fontFamily: 'Playfair Display, serif',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Add member
          </button>
          <button
            onClick={handleSignOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--parchment-dim)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '7px 12px',
              fontFamily: 'Lora, serif',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>

      {/* Empty state */}
      {members.length <= 1 && !loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          <p
            style={{
              fontFamily: 'Playfair Display, serif',
              fontStyle: 'italic',
              color: 'var(--parchment-dim)',
              fontSize: 15,
              textAlign: 'center',
              maxWidth: 300,
              lineHeight: 1.7,
            }}
          >
            Your tree begins with you.
            <br />
            <span style={{ fontSize: 12 }}>
              Double-click your card to edit, or press{' '}
              <span style={{ color: 'var(--gold)' }}>Add member</span> to grow your family.
            </span>
          </p>
        </div>
      )}

      {/* React Flow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(196,144,64,0.15)"
        />
        <Controls
          position="bottom-right"
          style={{ bottom: 24, right: 24 }}
        />
        <MiniMap
          position="bottom-left"
          style={{ bottom: 24, left: 24 }}
          nodeColor={(n) =>
            (n.data as { member: Member }).member?.is_root ? 'var(--gold)' : '#3a3020'
          }
          maskColor="rgba(15,12,8,0.8)"
        />
      </ReactFlow>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 70,
          right: 16,
          zIndex: 10,
          background: 'rgba(28,22,16,0.9)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 14px',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--parchment-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Legend
        </div>
        {[
          { color: '#c49040', label: 'Parent / Child', dash: false },
          { color: '#b06080', label: 'Spouse', dash: true },
          { color: '#507090', label: 'Sibling', dash: false },
          { color: '#607060', label: 'Other', dash: false },
        ].map(({ color, label, dash }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <svg width={28} height={8}>
              <line
                x1={0} y1={4} x2={28} y2={4}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={dash ? '5 3' : undefined}
              />
            </svg>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 11, color: 'var(--parchment-dim)' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10 }}>💡</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 10, color: 'var(--parchment-dim)', fontStyle: 'italic' }}>
            Double-click to edit
          </span>
        </div>
      </div>

      {/* Modal */}
      {modal && userId && (
        <MemberModal
          mode={modal.mode}
          member={modal.member}
          sourceForConnect={modal.sourceForConnect}
          userId={userId}
          onClose={() => setModal(null)}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  )
}
