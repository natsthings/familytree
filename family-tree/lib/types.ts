export interface Member {
  id: string
  user_id: string
  name: string
  birth_year: number | null
  birth_date: string | null
  death_year: number | null
  death_date: string | null
  notes: string | null
  photo_url: string | null
  is_root: boolean
  position_x: number
  position_y: number
  social_links: SocialLink[] | null
  claimed_by: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface SocialLink {
  type: 'phone' | 'email' | 'facebook' | 'instagram' | 'obituary' | 'address' | 'website' | 'other'
  label: string
  url: string
}

export interface Relationship {
  id: string
  user_id: string
  source_id: string
  target_id: string
  relation_type: 'parent' | 'child' | 'spouse' | 'sibling' | 'step_sibling' | 'other'
  label: string | null
  created_at: string
}

export type RelationType = Relationship['relation_type']

export const RELATION_LABELS: Record<RelationType, string> = {
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse / Partner',
  sibling: 'Sibling',
  step_sibling: 'Step-Sibling',
  other: 'Other',
}

export interface ScrapbookItem {
  id: string
  member_id: string
  user_id: string
  type: 'photo' | 'text'
  content: string
  caption: string | null
  date_taken: string | null
  pos_x: number
  pos_y: number
  width: number
  rotation: number
  created_at: string
}
