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
  EdgeChange,
  Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  BackgroundVariant,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { createClient } from '@/lib/supabase'
import { Member, Relationship } from '@/lib/types'
import MemberNode from '@/components/MemberNode'
import MemberModal from '@/components/MemberModal'
import { LogOut, Plus, TreePine, Save } from 'lucide-react'

function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
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

// Determine edge style from relation type
function edgeStyle(relType: string) {
  const isSpouse = relType === 'spouse'
  const isSibling = relType === 'sibling'
  const isHorizontal = isSpouse || isSibling
  const color = relType === 'spouse' ? '#b06080'
    : relType === 'sibling' ? '#507090'
    : relType === 'other' ? '#607060'
    : '#c49040'

  return {
    isHorizontal,
    isSpouse,
    color,
    sourceHandle: isHorizontal ? 'right' : 'bottom',
    targetHandle: isHorizontal ? 'left' : 'top',
  }
}

// Pending drag-connect state
interface PendingConnect {
  sourceId: string
  sourceHandle: string
}

export default function TreePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [localEdges, setLocalEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Modal state
  const [modal, setModal] = useState<{
    mode: 'add' | 'edit' | 'connect'
    member?: Member
    sourceForConnect?: Member
  } | null>(null)

  // When user drags a new connection — ask them what relationship it is
  const [pendingConnect, setPendingConnect] = useState<{
    sourceId: string
    targetId: string
  } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
      else setUserId(session.user.id)
    })
  }, [router])

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

  useEffect(() => { if (userId) loadData() }, [userId])

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

  // Build edges
  const builtEdges: Edge[] = useMemo(() => {
    return relationships.map((r) => {
      const { isHorizontal, isSpouse, color, sourceHandle, targetHandle } = edgeStyle(r.relation_type)
      return {
        id: r.id,
        source: r.source_id,
        target: r.target_id,
        sourceHandle,
        targetHandle,
        type: 'smoothstep',
        className: `edge-${r.relation_type}`,
        label: r.label ? r.label : isSpouse ? '♥' : '',
        labelStyle: {
          fill: isSpouse ? '#b06080' : '#b8a882',
          fontFamily: 'Lora, serif',
          fontSize: isSpouse ? 14 : 11,
          fontStyle: 'italic',
        },
        labelBgStyle: { fill: '#1c1610', fillOpacity: 0.85 },
        style: {
          stroke: color,
          strokeWidth: isSpouse ? 2 : 1.5,
          strokeDasharray: isSpouse ? '6 3' : undefined,
        },
        markerEnd: !isHorizontal ? {
          type: MarkerType.ArrowClosed,
          color,
          width: 14,
          height: 14,
        } : undefined,
        animated: isSpouse,
      }
    })
  }, [relationships])

  useEffect(() => { setLocalEdges(builtEdges) }, [builtEdges])

  const savePositions = useDebouncedCallback(
    async (updatedNodes: Node[]) => {
      setSaveStatus('saving')
      const supabase = createClient()
      await Promise.all(
        updatedNodes.map((n) =>
          supabase.from('members')
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
        const hasMoved = changes.some((c) => c.type === 'position' && c.dragging === false)
        if (hasMoved) savePositions(updated)
        return updated
      })
    },
    [savePositions]
  )

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removals = changes.filter((c) => c.type === 'remove')
    if (removals.length > 0) {
      const supabase = createClient()
      removals.forEach((c) => {
        if (c.type === 'remove') {
          supabase.from('relationships').delete().eq('id', c.id).then(({ error }) => {
            if (error) console.error('Failed to delete relationship:', error)
          })
        }
      })
    }
    setLocalEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  // Called when user drags a new connection between two nodes
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    // Open the connect modal to set relationship type, pre-filled with source
    const sourceMember = members.find(m => m.id === connection.source)
    if (sourceMember) {
      setPendingConnect({ sourceId: connection.source, targetId: connection.target })
      setModal({ mode: 'connect', sourceForConnect: sourceMember })
    }
  }, [members])

  // After modal saves in pending-connect mode, we don't need extra logic
  // because loadData() refreshes everything

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  function handleModalSaved() {
    setModal(null)
    setPendingConnect(null)
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
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', padding: '12px 20px',
        background: 'linear-gradient(to bottom, rgba(15,12,8,0.95) 0%, rgba(15,12,8,0) 100%)',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
          <TreePine size={22} color="#c49040" />
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#f5edd8', fontWeight: 600 }}>
            Roots
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {saveStatus !== 'idle' && (
          <div style={{
            pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6,
            color: '#b8a882', fontFamily: 'DM Mono, monospace', fontSize: 11, marginRight: 16,
          }}>
            <Save size={12} />
            {saveStatus === 'saving' ? 'saving…' : '✓ saved'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button onClick={() => setModal({ mode: 'add' })} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#c49040', color: '#1a1208', border: 'none', borderRadius: 8,
            padding: '7px 14px', fontFamily: 'Playfair Display, serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={14} /> Add member
          </button>
          <button onClick={handleSignOut} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.05)', color: '#b8a882',
            border: '1px solid #3a3020', borderRadius: 8,
            padding: '7px 12px', fontFamily: 'Lora, serif', fontSize: 13, cursor: 'pointer',
          }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      {/* Empty state */}
      {members.length <= 1 && !loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none',
        }}>
          <p style={{
            fontFamily: 'Playfair Display, serif', fontStyle: 'italic',
            color: '#b8a882', fontSize: 15, textAlign: 'center', maxWidth: 300, lineHeight: 1.7,
          }}>
            Your tree begins with you.<br />
            <span style={{ fontSize: 12 }}>
              Double-click your card to edit, or drag from a dot to connect two people.
            </span>
          </p>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={localEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: '#c49040', strokeWidth: 1.5 }}
        connectionLineType={'smoothstep' as any}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(196,144,64,0.15)" />
        <Controls position="bottom-right" style={{ bottom: 24, right: 24 }} />
        <MiniMap
          position="bottom-left"
          style={{ bottom: 24, left: 24 }}
          nodeColor={(n) => (n.data as { member: Member }).member?.is_root ? '#c49040' : '#3a3020'}
          maskColor="rgba(15,12,8,0.8)"
        />
      </ReactFlow>

      {/* Legend */}
      <div style={{
        position: 'absolute', top: 70, right: 16, zIndex: 10,
        background: 'rgba(28,22,16,0.92)', border: '1px solid #3a3020',
        borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(8px)',
        minWidth: 160,
      }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Legend
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#c49040', fontSize: 16, lineHeight: 1 }}>→</span>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 11, color: '#c49040' }}>Parent → Child</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#b06080', fontSize: 14, lineHeight: 1 }}>♥</span>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 11, color: '#b06080' }}>Spouse</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#507090', fontSize: 16, lineHeight: 1 }}>—</span>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 11, color: '#507090' }}>Sibling</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#607060', fontSize: 16, lineHeight: 1 }}>—</span>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 11, color: '#607060' }}>Other</span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #3a3020', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 10, color: '#b8a882', fontStyle: 'italic' }}>💡 Double-click card to edit</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 10, color: '#b8a882', fontStyle: 'italic' }}>✦ Drag from a dot to connect</span>
        </div>
      </div>

      {modal && userId && (
        <MemberModal
          mode={modal.mode}
          member={modal.member}
          sourceForConnect={modal.sourceForConnect}
          userId={userId}
          onClose={() => { setModal(null); setPendingConnect(null) }}
          onSaved={handleModalSaved}
          pendingTargetId={pendingConnect?.targetId}
        />
      )}
    </div>
  )
}
