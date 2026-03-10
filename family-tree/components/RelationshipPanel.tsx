'use client'

import { useMemo } from 'react'
import { Member, Relationship } from '@/lib/types'

interface RelationshipPanelProps {
  member: Member                  // the person being viewed
  allMembers: Member[]
  allRelationships: Relationship[]
  currentUserMemberId: string | null  // the member claimed by the logged-in user
  onClose: () => void
}

// Given the full graph, find what `target` is to `origin`
// Returns a human-readable string like "your grandfather" or null if no path found
function findRelationship(
  originId: string,
  targetId: string,
  members: Member[],
  rels: Relationship[]
): string | null {
  if (originId === targetId) return 'you'

  // Build adjacency: for each member, list their connections with type and direction
  type Link = { id: string; type: string; direction: 'up' | 'down' | 'lateral' }
  const graph: Record<string, Link[]> = {}

  members.forEach(m => { graph[m.id] = [] })

  rels.forEach(r => {
    const type = r.relation_type
    if (type === 'parent') {
      // source is parent of target => target goes up to source
      graph[r.target_id]?.push({ id: r.source_id, type: 'parent', direction: 'up' })
      graph[r.source_id]?.push({ id: r.target_id, type: 'child', direction: 'down' })
    } else if (type === 'child') {
      graph[r.source_id]?.push({ id: r.target_id, type: 'child', direction: 'down' })
      graph[r.target_id]?.push({ id: r.source_id, type: 'parent', direction: 'up' })
    } else if (type === 'spouse') {
      graph[r.source_id]?.push({ id: r.target_id, type: 'spouse', direction: 'lateral' })
      graph[r.target_id]?.push({ id: r.source_id, type: 'spouse', direction: 'lateral' })
    } else if (type === 'sibling' || type === 'step_sibling') {
      graph[r.source_id]?.push({ id: r.target_id, type, direction: 'lateral' })
      graph[r.target_id]?.push({ id: r.source_id, type, direction: 'lateral' })
    }
  })

  // BFS to find shortest path
  type State = { id: string; path: Array<{ id: string; type: string; direction: string }> }
  const visited = new Set<string>()
  const queue: State[] = [{ id: originId, path: [] }]
  visited.add(originId)

  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    for (const link of (graph[id] ?? [])) {
      if (visited.has(link.id)) continue
      const newPath = [...path, { id: link.id, type: link.type, direction: link.direction }]
      if (link.id === targetId) {
        return interpretPath(newPath)
      }
      visited.add(link.id)
      queue.push({ id: link.id, path: newPath })
    }
  }
  return null
}

function interpretPath(path: Array<{ id: string; type: string; direction: string }>): string {
  if (path.length === 0) return 'you'
  if (path.length === 1) {
    const t = path[0].type
    if (t === 'parent') return 'your parent'
    if (t === 'child') return 'your child'
    if (t === 'spouse') return 'your spouse / partner'
    if (t === 'sibling') return 'your sibling'
    if (t === 'step_sibling') return 'your step-sibling'
  }
  if (path.length === 2) {
    const [a, b] = path.map(p => p.type)
    if (a === 'parent' && b === 'parent') return 'your grandparent'
    if (a === 'parent' && b === 'sibling') return 'your aunt/uncle'
    if (a === 'parent' && b === 'spouse') return 'your step-parent'
    if (a === 'sibling' && b === 'child') return "your sibling's child"
    if (a === 'child' && b === 'child') return 'your grandchild'
    if (a === 'child' && b === 'spouse') return "your child's partner"
    if (a === 'spouse' && b === 'parent') return 'your parent-in-law'
    if (a === 'spouse' && b === 'sibling') return 'your brother/sister-in-law'
    if (a === 'spouse' && b === 'child') return 'your step-child'
    if (a === 'sibling' && b === 'spouse') return "your sibling's spouse"
  }
  if (path.length === 3) {
    const [a, b, c] = path.map(p => p.type)
    if (a === 'parent' && b === 'parent' && c === 'parent') return 'your great-grandparent'
    if (a === 'parent' && b === 'parent' && c === 'sibling') return 'your great-aunt/uncle'
    if (a === 'parent' && b === 'sibling' && c === 'child') return 'your first cousin'
    if (a === 'parent' && b === 'sibling' && c === 'spouse') return "your aunt/uncle's spouse"
    if (a === 'child' && b === 'child' && c === 'child') return 'your great-grandchild'
    if (a === 'parent' && b === 'spouse' && c === 'child') return 'your step-sibling'
    if (a === 'sibling' && b === 'child' && c === 'child') return "your sibling's grandchild"
  }
  if (path.length === 4) {
    const [a, b, c, d] = path.map(p => p.type)
    if (a === 'parent' && b === 'parent' && c === 'parent' && d === 'parent') return 'your great-great-grandparent'
    if (a === 'parent' && b === 'parent' && c === 'parent' && d === 'sibling') return 'your great-great-aunt/uncle'
    if (a === 'parent' && b === 'parent' && c === 'sibling' && d === 'child') return 'your second cousin'
    if (a === 'parent' && b === 'sibling' && c === 'child' && d === 'child') return 'your first cousin once removed'
  }
  if (path.length === 5) {
    const types = path.map(p => p.type)
    if (types.every((t, i) => t === ['parent','parent','parent','parent','parent'][i])) return 'your great-great-great-grandparent'
    if (types.join(',') === 'parent,parent,parent,sibling,child') return 'your third cousin'
    if (types.join(',') === 'parent,parent,sibling,child,child') return 'your second cousin once removed'
  }

  // Fallback: describe the path generically based on ups/downs/laterals
  const types = path.map(p => p.type)
  const ups = types.filter(t => t === 'parent').length
  const downs = types.filter(t => t === 'child').length
  const hasSpouse = types.includes('spouse')
  const hasSibling = types.includes('sibling') || types.includes('step_sibling')

  // Pure ascent: parent, grandparent, great-grandparent...
  if (ups > 0 && downs === 0 && !hasSpouse && !hasSibling) {
    if (ups === 1) return 'your parent'
    if (ups === 2) return 'your grandparent'
    return `your ${'great-'.repeat(ups - 2)}grandparent`
  }
  // Pure descent: child, grandchild...
  if (downs > 0 && ups === 0 && !hasSpouse && !hasSibling) {
    if (downs === 1) return 'your child'
    if (downs === 2) return 'your grandchild'
    return `your ${'great-'.repeat(downs - 2)}grandchild`
  }
  // Up then sibling = aunt/uncle at various removes
  if (ups > 0 && hasSibling && downs === 0) {
    if (ups === 1) return 'your aunt/uncle'
    return `your ${'great-'.repeat(ups - 1)}aunt/uncle`
  }
  // Sibling then down = niece/nephew at various removes
  if (hasSibling && downs > 0 && ups === 0) {
    if (downs === 1) return 'your niece/nephew'
    return `your ${'great-'.repeat(downs - 1)}niece/nephew`
  }
  // Up then sibling then down = cousins
  if (ups > 0 && hasSibling && downs > 0) {
    const degree = Math.min(ups, downs)
    const remove = Math.abs(ups - downs)
    const degreeStr = degree === 1 ? 'first' : degree === 2 ? 'second' : degree === 3 ? 'third' : `${degree}th`
    if (remove === 0) return `your ${degreeStr} cousin`
    return `your ${degreeStr} cousin ${remove === 1 ? 'once' : remove === 2 ? 'twice' : `${remove}x`} removed`
  }
  // In-law paths
  if (hasSpouse && ups > 0) return `your ${'great-'.repeat(Math.max(0, ups - 1))}parent-in-law`
  if (hasSpouse && downs > 0) return `your ${'great-'.repeat(Math.max(0, downs - 1))}child-in-law`
  if (hasSpouse && hasSibling) return 'your sibling-in-law'
  return 'a distant relative'
}

export default function RelationshipPanel({ member, allMembers, allRelationships, currentUserMemberId, onClose }: RelationshipPanelProps) {
  // Direct connections of this person
  const directConnections = useMemo(() => {
    return allRelationships
      .filter(r => r.source_id === member.id || r.target_id === member.id)
      .map(r => {
        const otherId = r.source_id === member.id ? r.target_id : r.source_id
        const other = allMembers.find(m => m.id === otherId)
        // Determine label from this person's perspective
        let label: string = r.relation_type
        if (r.relation_type === 'parent') {
          label = r.source_id === member.id ? 'Parent of' : 'Child of'
        } else if (r.relation_type === 'child') {
          label = r.source_id === member.id ? 'Child of' : 'Parent of'
        } else if (r.relation_type === 'spouse') {
          label = 'Spouse / Partner'
        } else if (r.relation_type === 'sibling') {
          label = 'Sibling'
        } else if (r.relation_type === 'step_sibling') {
          label = 'Step-Sibling'
        } else {
          label = r.label ?? 'Other'
        }
        return { other, label, relId: r.id }
      })
      .filter(c => c.other)
  }, [member, allMembers, allRelationships])

  // Collect all unique origins from this person + all ancestors
  const heritage = useMemo(() => {
    const collected = new Set<string>()
    const visited = new Set<string>()
    const queue = [member.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const m = allMembers.find(m => m.id === id)
      if (m?.origins) m.origins.forEach(o => collected.add(o))
      // Walk up to parents
      allRelationships.forEach(r => {
        if (r.relation_type === 'parent' && r.target_id === id && !visited.has(r.source_id)) queue.push(r.source_id)
        if (r.relation_type === 'child' && r.source_id === id && !visited.has(r.target_id)) queue.push(r.target_id)
      })
    }
    return Array.from(collected)
  }, [member, allMembers, allRelationships])

  // What this person is to the current user
  const relationToUser = useMemo(() => {
    if (!currentUserMemberId || currentUserMemberId === member.id) return null
    return findRelationship(currentUserMemberId, member.id, allMembers, allRelationships)
  }, [currentUserMemberId, member.id, allMembers, allRelationships])

  return (
    <div style={{
      background: '#1c1610', border: '1px solid #3a3020', borderRadius: 14,
      padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 14, color: '#f5edd8' }}>
          🌿 Family Connections
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#b8a882', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>
      </div>

      {/* Relation to current user */}
      {relationToUser && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(196,144,64,0.08)', border: '1px solid rgba(196,144,64,0.2)', borderRadius: 10 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#c49040', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Who they are to you
          </div>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 15, color: '#e0b060', fontStyle: 'italic' }}>
            {relationToUser.charAt(0).toUpperCase() + relationToUser.slice(1)}
          </div>
        </div>
      )}
      {!relationToUser && currentUserMemberId && currentUserMemberId !== member.id && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#0f0c08', border: '1px solid #3a3020', borderRadius: 10 }}>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 12, color: '#b8a882', fontStyle: 'italic' }}>
            No direct relationship path found
          </div>
        </div>
      )}

      {/* Heritage */}
      {heritage.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Heritage
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {heritage.map((o, i) => (
              <span key={i} style={{
                background: 'rgba(80,112,90,0.15)', border: '1px solid rgba(80,112,90,0.35)',
                borderRadius: 20, padding: '3px 10px',
                fontFamily: 'Lora, serif', fontSize: 12, color: '#80b090', fontStyle: 'italic',
              }}>{o}</span>
            ))}
          </div>
        </div>
      )}

      {/* Direct connections */}
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#b8a882', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
        Connections
      </div>
      {directConnections.length === 0 ? (
        <div style={{ fontFamily: 'Lora, serif', fontSize: 12, color: '#b8a882', fontStyle: 'italic' }}>No connections yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {directConnections.map(({ other, label, relId }) => (
            <div key={relId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#0f0c08', borderRadius: 8, border: '1px solid #3a3020' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #3a3020, #252015)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, overflow: 'hidden' }}>
                {other!.photo_url
                  ? <img src={other!.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : other!.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Lora, serif', fontSize: 13, color: '#f5edd8' }}>{other!.name}</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#b8a882' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
