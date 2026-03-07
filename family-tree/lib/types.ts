export interface Member {
  id: string
  user_id: string
  name: string
  birth_year: number | null
  death_year: number | null
  notes: string | null
  photo_url: string | null
  is_root: boolean
  position_x: number
  position_y: number
  created_at: string
  updated_at: string
}

export interface Relationship {
  id: string
  user_id: string
  source_id: string
  target_id: string
  relation_type: 'parent' | 'child' | 'spouse' | 'sibling' | 'other'
  label: string | null
  created_at: string
}

export type RelationType = Relationship['relation_type']

export const RELATION_LABELS: Record<RelationType, string> = {
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse / Partner',
  sibling: 'Sibling',
  other: 'Other',
}
