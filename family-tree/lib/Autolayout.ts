import { Member, Relationship } from '@/lib/types'


// Auto-layout: assigns (x, y) positions based on generational distance from the signed-in user
// Returns a map of memberId -> {x, y}
function computeAutoLayout(
  members: Member[],
  relationships: Relationship[],
  anchorMemberId: string | null
): Record<string, { x: number; y: number }> {
  if (!anchorMemberId || members.length === 0) return {}

  const NODE_W = 200
  const NODE_H = 140
  const H_GAP = 40   // horizontal gap between nodes
  const V_GAP = 80   // vertical gap between generations

  // Step 1: Assign generation levels via BFS from anchor
  const levels: Record<string, number> = {}
  const spouseOf: Record<string, string> = {}

  // Build quick lookups
  const parentOf: Record<string, string[]> = {}   // child -> [parents]
  const childrenOf: Record<string, string[]> = {}  // parent -> [children]
  const spousesOf: Record<string, string[]> = {}   // person -> [spouses]

  members.forEach(m => {
    parentOf[m.id] = []
    childrenOf[m.id] = []
    spousesOf[m.id] = []
  })

  relationships.forEach(r => {
    if (r.relation_type === 'parent') {
      // source is parent of target
      childrenOf[r.source_id]?.push(r.target_id)
      parentOf[r.target_id]?.push(r.source_id)
    } else if (r.relation_type === 'child') {
      // source is child of target
      parentOf[r.source_id]?.push(r.target_id)
      childrenOf[r.target_id]?.push(r.source_id)
    } else if (r.relation_type === 'spouse') {
      spousesOf[r.source_id]?.push(r.target_id)
      spousesOf[r.target_id]?.push(r.source_id)
    }
  })

  // BFS to assign levels
  const queue: { id: string; level: number }[] = [{ id: anchorMemberId, level: 0 }]
  const visited = new Set<string>([anchorMemberId])
  levels[anchorMemberId] = 0

  while (queue.length > 0) {
    const { id, level } = queue.shift()!
    // Parents go up (level - 1)
    for (const pid of (parentOf[id] ?? [])) {
      if (!visited.has(pid)) {
        visited.add(pid)
        levels[pid] = level - 1
        queue.push({ id: pid, level: level - 1 })
      }
    }
    // Children go down (level + 1)
    for (const cid of (childrenOf[id] ?? [])) {
      if (!visited.has(cid)) {
        visited.add(cid)
        levels[cid] = level + 1
        queue.push({ id: cid, level: level + 1 })
      }
    }
    // Spouses same level
    for (const sid of (spousesOf[id] ?? [])) {
      if (!visited.has(sid)) {
        visited.add(sid)
        levels[sid] = level
        spouseOf[sid] = id
        queue.push({ id: sid, level })
      }
    }
  }

  // Assign unvisited members to level 99 (off to the side)
  members.forEach(m => {
    if (!(m.id in levels)) levels[m.id] = 99
  })

  // Step 2: Group members by level
  const byLevel: Record<number, string[]> = {}
  members.forEach(m => {
    const lvl = levels[m.id]
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(m.id)
  })

  // Step 3: Sort each level — keep spouses adjacent, anchor centered
  const sortedLevels = Object.keys(byLevel).map(Number).sort((a, b) => a - b)

  const positions: Record<string, { x: number; y: number }> = {}

  sortedLevels.forEach((lvl, li) => {
    const ids = byLevel[lvl]

    // Sort: put anchor first at level 0, keep spouses next to each other
    const ordered: string[] = []
    const placed = new Set<string>()

    // Anchor goes first at level 0
    if (lvl === 0) {
      ordered.push(anchorMemberId)
      placed.add(anchorMemberId)
      // Spouse(s) right after
      for (const sid of (spousesOf[anchorMemberId] ?? [])) {
        if (!placed.has(sid) && ids.includes(sid)) {
          ordered.push(sid)
          placed.add(sid)
        }
      }
    }

    // Remaining: group spouses together
    for (const id of ids) {
      if (placed.has(id)) continue
      ordered.push(id)
      placed.add(id)
      for (const sid of (spousesOf[id] ?? [])) {
        if (!placed.has(sid) && ids.includes(sid)) {
          ordered.push(sid)
          placed.add(sid)
        }
      }
    }

    const count = ordered.length
    const totalW = count * NODE_W + (count - 1) * H_GAP
    const startX = -totalW / 2

    // y position: level 0 = y 0, negatives go up, positives go down
    const y = lvl === 99 ? (sortedLevels.length + 2) * (NODE_H + V_GAP) : lvl * (NODE_H + V_GAP)

    ordered.forEach((id, i) => {
      positions[id] = {
        x: startX + i * (NODE_W + H_GAP),
        y,
      }
    })
  })

  return positions
}

export { computeAutoLayout }
