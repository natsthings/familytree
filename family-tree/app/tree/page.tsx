'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import ReactFlow, {
  Background, Controls, MiniMap,
  Node, Edge, NodeChange, EdgeChange, Connection,
  applyNodeChanges, applyEdgeChanges,
  BackgroundVariant, MarkerType,
  EdgeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { createClient } from '@/lib/supabase'
import { Member, Relationship } from '@/lib/types'
import MemberNode from '@/components/MemberNode'
import MemberModal from '@/components/MemberModal'
import WelcomeLetter from '@/components/WelcomeLetter'
import DeleteRequestModal from '@/components/DeleteRequestModal'
import MessageBox from '@/components/MessageBox'
import { LogOut, Plus, TreePine, Save, Mail } from 'lucide-react'

const ADMIN_EMAIL = 'nataliabern2007nb@gmail.com'

function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

const nodeTypes = { memberNode: MemberNode }

function edgeStyle(relType: string) {
  const isSpouse = relType === 'spouse'
  const isSibling = relType === 'sibling'
  const isHorizontal = isSpouse || isSibling
  const color = relType === 'spouse' ? '#b06080'
    : relType === 'sibling' ? '#507090'
    : relType === 'other' ? '#607060'
    : '#c49040'
  return { isHorizontal, isSpouse, color, sourceHandle: isHorizontal ? 'right' : 'bottom', targetHandle: isHorizontal ? 'left' : 'top' }
}

export default function TreePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [privateMode, setPrivateMode] = useState(false)
  const [privateNotes, setPrivateNotes] = useState<Record<string, string>>({})
  const [privateRelationships, setPrivateRelationships] = useState<Relationship[]>([])
  const [privateMemberIds, setPrivateMemberIds] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<Member[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [localEdges, setLocalEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showWelcome, setShowWelcome] = useState(false)
  const [edgeTooltip, setEdgeTooltip] = useState<{ x: number; y: number; label: string } | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<{ targetType: 'member' | 'relationship'; targetId: string; description: string } | null>(null)
  const [messageBox, setMessageBox] = useState<{ memberId: string; memberName: string } | null>(null)

  const [modal, setModal] = useState<{
    mode: 'add' | 'edit' | 'connect'
    member?: Member
    sourceForConnect?: Member
  } | null>(null)
  const [pendingConnect, setPendingConnect] = useState<{ sourceId: string; targetId: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setUserId(session.user.id)
      setUserEmail(session.user.email ?? null)
      setIsAdmin(session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())

      // Show welcome letter once per login session (not on refresh)
      const sessionSeen = sessionStorage.getItem('welcomeSeen')
      if (!sessionSeen) {
        setShowWelcome(true)
        sessionStorage.setItem('welcomeSeen', '1')
      }
    })
  }, [router])

  async function loadData() {
    if (!userId) return
    const supabase = createClient()

    const [{ data: membersData }, { data: relsData }, { data: myPositions }] = await Promise.all([
      supabase.from('members').select('*').order('name'),
      supabase.from('relationships').select('*'),
      supabase.from('member_positions').select('*').eq('user_id', userId),
    ])

    const allMembers = (membersData ?? []).map((m: any) => {
      const myPos = myPositions?.find((p: any) => p.member_id === m.id)
      return myPos ? { ...m, position_x: myPos.position_x, position_y: myPos.position_y } : m
    })

    setMembers(allMembers)
    setRelationships(relsData ?? [])

    if (isAdmin) {
      const [{ data: notesData }, { data: privateRelsData }, { data: privateMembersData }] = await Promise.all([
        supabase.from('private_notes').select('*').eq('user_id', userId),
        supabase.from('private_relationships').select('*').eq('user_id', userId),
        supabase.from('private_members').select('*').eq('user_id', userId),
      ])
      const notesMap: Record<string, string> = {}
      ;(notesData ?? []).forEach((n: any) => { notesMap[n.member_id] = n.note })
      setPrivateNotes(notesMap)
      setPrivateRelationships(privateRelsData ?? [])
      // Merge private members into the members list
      if (privateMembersData && privateMembersData.length > 0) {
        const privateIds = new Set(privateMembersData.map((m: any) => m.id as string))
        setPrivateMemberIds(privateIds)
        setMembers(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const newPrivate = privateMembersData
            .filter((m: any) => !existingIds.has(m.id))
            .map((m: any) => ({ ...m, is_root: false, is_admin: false, claimed_by: null, updated_at: m.created_at, _isPrivate: true }))
          return [...prev, ...newPrivate]
        })
      }
    }

    const myProfile = allMembers.find((m: any) => m.claimed_by === userId)
    if (myProfile) setUserName(myProfile.name)

    setLoading(false)
  }

  useEffect(() => { if (userId) loadData() }, [userId])

  useEffect(() => {
    const visibleMembers = members.filter(m =>
      // In public mode, hide private members
      privateMode ? true : !privateMemberIds.has(m.id)
    )
    const newNodes: Node[] = visibleMembers.map((m) => ({
      id: m.id,
      type: 'memberNode',
      position: { x: m.position_x, y: m.position_y },
      data: {
        member: { ...m, _isPrivate: privateMemberIds.has(m.id) },
        currentUserId: userId,
        isAdmin,
        onEdit: (member: Member) => setModal({ mode: 'edit', member }),
        onConnect: (member: Member) => setModal({ mode: 'connect', sourceForConnect: member }),
        onMessage: (member: Member) => setMessageBox({ memberId: member.id, memberName: member.name }),
      },
    }))
    setNodes(newNodes)
  }, [members, userId, isAdmin, privateMemberIds, privateMode])

  const builtEdges: Edge[] = useMemo(() => {
    const allRels = privateMode
      ? [...relationships, ...privateRelationships.map(r => ({ ...r, _private: true }))]
      : relationships
    return allRels.map((r: any) => {
      const { isHorizontal, isSpouse, color, sourceHandle, targetHandle } = edgeStyle(r.relation_type)
      const src = members.find(m => m.id === r.source_id)
      const tgt = members.find(m => m.id === r.target_id)
      const tooltipLabel = src && tgt
        ? `${src.name} & ${tgt.name} · ${r.relation_type}`
        : r.relation_type
      return {
        id: r.id,
        source: r.source_id,
        target: r.target_id,
        sourceHandle,
        targetHandle,
        type: 'smoothstep',
        className: `edge-${r.relation_type}${r._private ? ' edge-private' : ''}`,
        data: { tooltipLabel: r._private ? `🔒 ${tooltipLabel}` : tooltipLabel, relType: r.relation_type, isPrivate: r._private },
        label: r.label ? r.label : isSpouse ? '♥' : '',
        labelStyle: { fill: isSpouse ? '#b06080' : '#b8a882', fontFamily: 'Lora, serif', fontSize: isSpouse ? 14 : 11, fontStyle: 'italic' },
        labelBgStyle: { fill: '#1c1610', fillOpacity: 0.85 },
        style: { stroke: color, strokeWidth: isSpouse ? 2 : 1.5, strokeDasharray: isSpouse ? '6 3' : undefined },
        markerEnd: !isHorizontal ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 } : undefined,
        animated: isSpouse,
      }
    })
  }, [relationships, privateRelationships, members, privateMode])

  useEffect(() => { setLocalEdges(builtEdges) }, [builtEdges])

  // Position saving — everyone saves their own view to member_positions
  // Admin additionally updates the master positions on members table
  const savePositions = useDebouncedCallback(
    async (updatedNodes: Node[]) => {
      if (!userId) return
      setSaveStatus('saving')
      const supabase = createClient()
      // Save per-user positions
      await Promise.all(updatedNodes.map((n) =>
        supabase.from('member_positions').upsert({
          user_id: userId,
          member_id: n.id,
          position_x: n.position.x,
          position_y: n.position.y,
        }, { onConflict: 'user_id,member_id' })
      ))
      // Admin also updates master layout
      if (isAdmin) {
        await Promise.all(updatedNodes.map((n) =>
          supabase.from('members').update({ position_x: n.position.x, position_y: n.position.y }).eq('id', n.id)
        ))
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 1200
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds)
      const hasMoved = changes.some((c) => c.type === 'position' && c.dragging === false)
      if (hasMoved) savePositions(updated)
      return updated
    })
  }, [savePositions])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removals = changes.filter((c) => c.type === 'remove')
    if (removals.length > 0) {
      if (!isAdmin) {
        // Non-admin: show delete request for each removed edge
        const ids = removals.map(c => c.id)
        const rel = relationships.find(r => ids.includes(r.id))
        if (rel) {
          const src = members.find(m => m.id === rel.source_id)
          const tgt = members.find(m => m.id === rel.target_id)
          setDeleteRequest({ targetType: 'relationship', targetId: rel.id, description: `${src?.name ?? '?'} ↔ ${tgt?.name ?? '?'} (${rel.relation_type})` })
        }
        return // don't remove from local state
      }
      const supabase = createClient()
      const ids = removals.map((c) => c.id)
      // Check if this is a private relationship
      const privateIds = ids.filter(id => privateRelationships.some(r => r.id === id))
      const publicIds = ids.filter(id => !privateIds.includes(id))
      if (privateIds.length > 0) {
        setPrivateRelationships(prev => prev.filter(r => !privateIds.includes(r.id)))
        privateIds.forEach(id => supabase.from('private_relationships').delete().eq('id', id))
      }
      if (publicIds.length > 0) {
        setRelationships((prev) => prev.filter((r) => !publicIds.includes(r.id)))
        publicIds.forEach((id) => supabase.from('relationships').delete().eq('id', id))
      }
    }
    setLocalEdges((eds) => applyEdgeChanges(changes, eds))
  }, [isAdmin, relationships, members])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    const sourceMember = members.find(m => m.id === connection.source)
    if (sourceMember) {
      setPendingConnect({ sourceId: connection.source, targetId: connection.target })
      setModal({ mode: 'connect', sourceForConnect: sourceMember })
    }
  }, [members])

  const onEdgeMouseEnter: EdgeMouseHandler = useCallback((event, edge) => {
    setEdgeTooltip({ x: event.clientX, y: event.clientY, label: edge.data?.tooltipLabel ?? '' })
  }, [])
  const onEdgeMouseMove: EdgeMouseHandler = useCallback((event, edge) => {
    setEdgeTooltip({ x: event.clientX, y: event.clientY, label: edge.data?.tooltipLabel ?? '' })
  }, [])
  const onEdgeMouseLeave: EdgeMouseHandler = useCallback(() => {
    setEdgeTooltip(null)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  function handleModalSaved(deletedMemberId?: string) {
    setModal(null)
    setPendingConnect(null)
    if (deletedMemberId) {
      setMembers(prev => prev.filter(m => m.id !== deletedMemberId))
      setRelationships(prev => prev.filter(r => r.source_id !== deletedMemberId && r.target_id !== deletedMemberId))
      setPrivateRelationships(prev => prev.filter(r => r.source_id !== deletedMemberId && r.target_id !== deletedMemberId))
      setPrivateMemberIds(prev => { const next = new Set(prev); next.delete(deletedMemberId); return next })
    } else {
      loadData()
    }
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
      {/* Welcome letter */}
      {showWelcome && <WelcomeLetter onClose={() => setShowWelcome(false)} />}

      {/* Private mode banner */}
      {privateMode && (
        <div style={{ position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(80,40,80,0.85)', border: '1px solid #806080', borderRadius: 20, padding: '4px 16px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#d090d0', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          🔒 Private view — your changes here are invisible to everyone else
        </div>
      )}

      {/* Edge tooltip */}
      {edgeTooltip && (
        <div style={{
          position: 'fixed', left: edgeTooltip.x + 12, top: edgeTooltip.y - 32,
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(28,22,16,0.95)', border: '1px solid #3a3020',
          borderRadius: 8, padding: '5px 10px',
          fontFamily: 'Lora, serif', fontSize: 12, color: '#f5edd8',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
        }}>
          {edgeTooltip.label}
        </div>
      )}

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', padding: '12px 20px',
        background: 'linear-gradient(to bottom, rgba(15,12,8,0.95) 0%, rgba(15,12,8,0) 100%)',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
          <TreePine size={22} color="#c49040" />
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#f5edd8', fontWeight: 600 }}>Roots</span>
        </div>
        <div style={{ flex: 1 }} />
        {saveStatus !== 'idle' && (
          <div style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6, color: '#b8a882', fontFamily: 'DM Mono, monospace', fontSize: 11, marginRight: 16 }}>
            <Save size={12} /> {saveStatus === 'saving' ? 'saving…' : '✓ saved'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button onClick={() => setShowWelcome(true)} title="Read welcome letter" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', color: '#b8a882', border: '1px solid #3a3020', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
            <Mail size={13} />
          </button>
          {isAdmin && (
            <button onClick={() => setPrivateMode(p => !p)} title={privateMode ? 'Switch to public tree' : 'Switch to private tree'} style={{ display: 'flex', alignItems: 'center', gap: 6, background: privateMode ? 'rgba(80,40,80,0.5)' : 'rgba(255,255,255,0.05)', color: privateMode ? '#d090d0' : '#b8a882', border: `1px solid ${privateMode ? '#806080' : '#3a3020'}`, borderRadius: 8, padding: '7px 12px', fontFamily: 'Lora, serif', fontSize: 13, cursor: 'pointer' }}>
              {privateMode ? '🔒 Private' : '🌐 Public'}
            </button>
          )}
          <button onClick={() => setModal({ mode: 'add' })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#c49040', color: '#1a1208', border: 'none', borderRadius: 8, padding: '7px 14px', fontFamily: 'Playfair Display, serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add member
          </button>
          <button onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', color: '#b8a882', border: '1px solid #3a3020', borderRadius: 8, padding: '7px 12px', fontFamily: 'Lora, serif', fontSize: 13, cursor: 'pointer' }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={localEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseMove={onEdgeMouseMove}
        onEdgeMouseLeave={onEdgeMouseLeave}
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
        <MiniMap position="bottom-left" style={{ bottom: 24, left: 24 }}
          nodeColor={(n) => (n.data as any).member?.is_root ? '#c49040' : '#3a3020'}
          maskColor="rgba(15,12,8,0.8)" />
      </ReactFlow>

      {/* Legend */}
      <div style={{ position: 'absolute', top: 70, right: 16, zIndex: 10, background: 'rgba(28,22,16,0.92)', border: '1px solid #3a3020', borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(8px)', minWidth: 160 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Legend</div>
        {[['→', '#c49040', 'Parent → Child'], ['♥', '#b06080', 'Spouse'], ['—', '#507090', 'Sibling'], ['—', '#607060', 'Other']].map(([icon, color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ color, fontSize: icon === '♥' ? 14 : 16, lineHeight: 1 }}>{icon}</span>
            <span style={{ fontFamily: 'Lora, serif', fontSize: 11, color }}>{label}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #3a3020', paddingTop: 8, marginTop: 4 }}>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 10, color: '#b8a882', fontStyle: 'italic', display: 'block', marginBottom: 2 }}>💡 Double-click to edit</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 10, color: '#b8a882', fontStyle: 'italic', display: 'block' }}>✦ Drag dot to connect</span>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <>
          {modal && userId && (
            <MemberModal
              mode={modal.mode}
              member={modal.member}
              sourceForConnect={modal.sourceForConnect}
              userId={userId}
              isAdmin={isAdmin}
              privateMode={privateMode}
              onClose={() => { setModal(null); setPendingConnect(null) }}
              onSaved={(deletedId) => handleModalSaved(deletedId)}
              onRequestDelete={(targetId, description) => setDeleteRequest({ targetType: 'member', targetId, description })}
              pendingTargetId={pendingConnect?.targetId}
              allMembers={members}
            />
          )}
          {deleteRequest && userId && (
            <DeleteRequestModal
              userId={userId}
              requesterName={userName || userEmail || 'Unknown'}
              targetType={deleteRequest.targetType}
              targetId={deleteRequest.targetId}
              targetDescription={deleteRequest.description}
              onClose={() => setDeleteRequest(null)}
            />
          )}
          {messageBox && userId && (
            <MessageBox
              memberId={messageBox.memberId}
              memberName={messageBox.memberName}
              currentUserId={userId}
              currentUserName={userName || userEmail || 'Someone'}
              onClose={() => setMessageBox(null)}
            />
          )}
        </>,
        document.body
      )}
    </div>
  )
}
