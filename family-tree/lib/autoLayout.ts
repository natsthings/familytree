import { Member, Relationship } from '@/lib/types'

const NODE_W = 220
const NODE_H = 150
const H_GAP = 60
const V_GAP = 120
const STEP = NODE_W + H_GAP

export function computeAutoLayout(
  members: Member[],
  relationships: Relationship[],
  anchorMemberId: string | null
): Record<string, { x: number; y: number }> {
  if (!anchorMemberId || members.length === 0) return {}

  const memberIds = new Set(members.map(m => m.id))

  const parentsOf: Record<string, Set<string>> = {}
  const childrenOf: Record<string, Set<string>> = {}
  const spousesOf: Record<string, Set<string>> = {}
  const siblingsOf: Record<string, Set<string>> = {}

  members.forEach(m => {
    parentsOf[m.id] = new Set()
    childrenOf[m.id] = new Set()
    spousesOf[m.id] = new Set()
    siblingsOf[m.id] = new Set()
  })

  relationships.forEach(r => {
    if (!memberIds.has(r.source_id) || !memberIds.has(r.target_id)) return
    const t = r.relation_type
    if (t === 'parent') {
      childrenOf[r.source_id].add(r.target_id)
      parentsOf[r.target_id].add(r.source_id)
    } else if (t === 'child') {
      parentsOf[r.source_id].add(r.target_id)
      childrenOf[r.target_id].add(r.source_id)
    } else if (t === 'spouse') {
      spousesOf[r.source_id].add(r.target_id)
      spousesOf[r.target_id].add(r.source_id)
    } else if (t === 'sibling' || t === 'step_sibling' || t === 'half_sibling') {
      siblingsOf[r.source_id].add(r.target_id)
      siblingsOf[r.target_id].add(r.source_id)
    }
  })

  // BFS from anchor to assign generation levels
  const levels: Record<string, number> = { [anchorMemberId]: 0 }
  const visited = new Set<string>([anchorMemberId])
  const queue: string[] = [anchorMemberId]

  while (queue.length > 0) {
    const id = queue.shift()!
    const lvl = levels[id]
    for (const pid of Array.from(parentsOf[id])) {
      if (!visited.has(pid)) { visited.add(pid); levels[pid] = lvl - 1; queue.push(pid) }
    }
    for (const cid of Array.from(childrenOf[id])) {
      if (!visited.has(cid)) { visited.add(cid); levels[cid] = lvl + 1; queue.push(cid) }
    }
    for (const sid of Array.from(spousesOf[id])) {
      if (!visited.has(sid)) { visited.add(sid); levels[sid] = lvl; queue.push(sid) }
    }
    for (const sid of Array.from(siblingsOf[id])) {
      if (!visited.has(sid)) { visited.add(sid); levels[sid] = lvl; queue.push(sid) }
    }
  }

  // Unconnected members go below everything
  const maxLevel = members.reduce((max, m) => Math.max(max, levels[m.id] ?? -999), 0)
  members.forEach(m => { if (!(m.id in levels)) levels[m.id] = maxLevel + 3 })

  // Group by level
  const byLevel: Record<number, string[]> = {}
  members.forEach(m => {
    const lvl = levels[m.id]
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(m.id)
  })

  const sortedLevelNums = Object.keys(byLevel).map(Number).sort((a, b) => a - b)

  // Order within each level: spouses adjacent, siblings grouped
  const orderedByLevel: Record<number, string[]> = {}
  sortedLevelNums.forEach(lvl => {
    const ids = byLevel[lvl]
    const placed = new Set<string>()
    const ordered: string[] = []

    const placeWithSpouses = (id: string) => {
      if (placed.has(id) || !ids.includes(id)) return
      placed.add(id); ordered.push(id)
      for (const sid of Array.from(spousesOf[id])) {
        if (!placed.has(sid) && ids.includes(sid)) { placed.add(sid); ordered.push(sid) }
      }
    }

    if (lvl === 0) placeWithSpouses(anchorMemberId)

    // Group by sibling clusters
    for (const id of ids) {
      if (placed.has(id)) continue
      const cluster: string[] = []
      const cq = [id]; const cs = new Set<string>()
      while (cq.length > 0) {
        const cid = cq.shift()!
        if (cs.has(cid) || !ids.includes(cid)) continue
        cs.add(cid); cluster.push(cid)
        for (const sib of Array.from(siblingsOf[cid])) if (!cs.has(sib)) cq.push(sib)
      }
      for (const cid of cluster) placeWithSpouses(cid)
    }

    for (const id of ids) if (!placed.has(id)) { placed.add(id); ordered.push(id) }
    orderedByLevel[lvl] = ordered
  })

  const positions: Record<string, { x: number; y: number }> = {}

  // First pass: evenly space each generation centered at x=0
  sortedLevelNums.forEach(lvl => {
    const ordered = orderedByLevel[lvl]
    const count = ordered.length
    const totalW = count * NODE_W + (count - 1) * H_GAP
    const startX = -totalW / 2
    const y = lvl * (NODE_H + V_GAP)
    ordered.forEach((id, i) => { positions[id] = { x: startX + i * STEP, y } })
  })

  // Second pass: shift children to center under their parents
  for (const lvl of sortedLevelNums) {
    if (lvl === sortedLevelNums[0]) continue
    const ordered = orderedByLevel[lvl]

    // Group by shared parent set
    const parentGroups = new Map<string, string[]>()
    for (const id of ordered) {
      const myParents = Array.from(parentsOf[id]).filter(p => p in positions)
      // Include spouses of parents as co-parents
      const coParents = new Set(myParents)
      for (const p of myParents) for (const sp of Array.from(spousesOf[p])) if (sp in positions) coParents.add(sp)
      const key = Array.from(coParents).sort().join(',') || '__none__'
      if (!parentGroups.has(key)) parentGroups.set(key, [])
      parentGroups.get(key)!.push(id)
    }

    const desiredX: Record<string, number> = {}
    for (const [key, group] of parentGroups) {
      if (key === '__none__') continue
      const parentXs = key.split(',').map(pid => positions[pid].x)
      const centerX = parentXs.reduce((a, b) => a + b, 0) / parentXs.length
      const groupW = group.length * NODE_W + (group.length - 1) * H_GAP
      group.forEach((id, i) => { desiredX[id] = centerX - groupW / 2 + i * STEP })
    }

    for (const id of ordered) if (desiredX[id] !== undefined) positions[id].x = desiredX[id]

    // Resolve overlaps left-to-right
    const byX = ordered.slice().sort((a, b) => positions[a].x - positions[b].x)
    for (let i = 1; i < byX.length; i++) {
      const minX = positions[byX[i - 1]].x + STEP
      if (positions[byX[i]].x < minX) positions[byX[i]].x = minX
    }

    // Re-center level
    const xs = ordered.map(id => positions[id].x)
    const shift = (Math.min(...xs) + Math.max(...xs)) / 2
    for (const id of ordered) positions[id].x -= shift
  }

  return positions
}
