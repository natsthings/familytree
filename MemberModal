'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Member, Relationship, RELATION_LABELS, RelationType } from '@/lib/types'
import { createClient } from '@/lib/supabase'

interface MemberModalProps {
  mode: 'add' | 'edit' | 'connect'
  member?: Member | null            // for edit mode
  sourceForConnect?: Member | null  // for connect mode (adding relative to this person)
  userId: string
  onClose: () => void
  onSaved: () => void
}

export default function MemberModal({
  mode,
  member,
  sourceForConnect,
  userId,
  onClose,
  onSaved,
}: MemberModalProps) {
  const [name, setName] = useState(member?.name ?? '')
  const [birthYear, setBirthYear] = useState(member?.birth_year?.toString() ?? '')
  const [deathYear, setDeathYear] = useState(member?.death_year?.toString() ?? '')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [relationType, setRelationType] = useState<RelationType>('parent')
  const [customLabel, setCustomLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // For connect mode: which existing member to link to (vs creating a new one)
  const [connectTo, setConnectTo] = useState<'new' | 'existing'>('new')
  const [existingMembers, setExistingMembers] = useState<Member[]>([])
  const [selectedExistingId, setSelectedExistingId] = useState('')

  useEffect(() => {
    if (mode === 'connect') {
      const supabase = createClient()
      supabase
        .from('members')
        .select('*')
        .eq('user_id', userId)
        .neq('id', sourceForConnect?.id ?? '')
        .order('name')
        .then(({ data }) => setExistingMembers(data ?? []))
    }
  }, [mode, userId, sourceForConnect])

  async function handleSave() {
    setLoading(true)
    setError('')
    const supabase = createClient()

    try {
      if (mode === 'edit' && member) {
        const { error } = await supabase
          .from('members')
          .update({
            name,
            birth_year: birthYear ? parseInt(birthYear) : null,
            death_year: deathYear ? parseInt(deathYear) : null,
            notes: notes || null,
          })
          .eq('id', member.id)
        if (error) throw error

      } else if (mode === 'add') {
        const { error } = await supabase.from('members').insert({
          user_id: userId,
          name,
          birth_year: birthYear ? parseInt(birthYear) : null,
          death_year: deathYear ? parseInt(deathYear) : null,
          notes: notes || null,
          is_root: false,
          position_x: Math.random() * 400 - 200,
          position_y: Math.random() * 400 - 200,
        })
        if (error) throw error

      } else if (mode === 'connect') {
        let targetId = selectedExistingId

        if (connectTo === 'new') {
          // Create the new member first
          const { data: newMember, error: memberError } = await supabase
            .from('members')
            .insert({
              user_id: userId,
              name,
              birth_year: birthYear ? parseInt(birthYear) : null,
              death_year: deathYear ? parseInt(deathYear) : null,
              notes: notes || null,
              is_root: false,
              position_x: (sourceForConnect?.position_x ?? 0) + (Math.random() * 200 - 100),
              position_y: (sourceForConnect?.position_y ?? 0) + 180,
            })
            .select()
            .single()
          if (memberError || !newMember) throw memberError
          targetId = newMember.id
        }

        // Create the relationship
        const { error: relError } = await supabase.from('relationships').insert({
          user_id: userId,
          source_id: sourceForConnect!.id,
          target_id: targetId,
          relation_type: relationType,
          label: customLabel || null,
        })
        if (relError) throw relError
      }

      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!member || !confirm(`Remove ${member.name} from your tree?`)) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('members').delete().eq('id', member.id)
    onSaved()
  }

  const title =
    mode === 'edit' ? `Edit — ${member?.name}`
    : mode === 'connect' ? `Add relative to ${sourceForConnect?.name}`
    : 'Add family member'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 relative"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--parchment-dim)] hover:text-[var(--parchment)] transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="font-display text-lg text-[var(--parchment)] mb-5">{title}</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Connect mode: new vs existing toggle */}
          {mode === 'connect' && (
            <div className="flex gap-2">
              {(['new', 'existing'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setConnectTo(opt)}
                  className="flex-1 py-2 rounded-lg text-sm font-body border transition-colors"
                  style={{
                    background: connectTo === opt ? 'var(--gold)' : 'transparent',
                    color: connectTo === opt ? 'var(--bark-900)' : 'var(--parchment-dim)',
                    borderColor: connectTo === opt ? 'var(--gold)' : 'var(--border)',
                    fontWeight: connectTo === opt ? 600 : 400,
                  }}
                >
                  {opt === 'new' ? '+ New person' : 'Link existing'}
                </button>
              ))}
            </div>
          )}

          {/* Existing member picker */}
          {mode === 'connect' && connectTo === 'existing' && (
            <div>
              <label className="label-style">Select person</label>
              <select
                value={selectedExistingId}
                onChange={e => setSelectedExistingId(e.target.value)}
                className="input-style w-full"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: 'var(--ink)',
                  fontFamily: 'Lora, serif',
                  fontSize: 14,
                  width: '100%',
                }}
              >
                <option value="">— choose —</option>
                {existingMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Name field (hidden when linking existing) */}
          {(mode !== 'connect' || connectTo === 'new') && (
            <div>
              <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
                placeholder="Full name"
              />
            </div>
          )}

          {/* Years (hidden when linking existing) */}
          {(mode !== 'connect' || connectTo === 'new') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                  Born
                </label>
                <input
                  type="number"
                  value={birthYear}
                  onChange={e => setBirthYear(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
                  placeholder="1950"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                  Died
                </label>
                <input
                  type="number"
                  value={deathYear}
                  onChange={e => setDeathYear(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
                  placeholder="optional"
                />
              </div>
            </div>
          )}

          {/* Relation type (connect mode only) */}
          {mode === 'connect' && (
            <div>
              <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                Relationship to {sourceForConnect?.name}
              </label>
              <select
                value={relationType}
                onChange={e => setRelationType(e.target.value as RelationType)}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: 'var(--ink)',
                  fontFamily: 'Lora, serif',
                  fontSize: 14,
                  width: '100%',
                }}
              >
                {Object.entries(RELATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {mode === 'connect' && relationType === 'other' && (
            <div>
              <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                Custom label
              </label>
              <input
                type="text"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
                placeholder="e.g. Godfather, Cousin once removed…"
              />
            </div>
          )}

          {/* Notes */}
          {mode !== 'connect' && (
            <div>
              <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors resize-none"
                placeholder="Hometown, occupation, stories…"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          {mode === 'edit' && !member?.is_root && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-red-800/50 text-red-400 hover:bg-red-950/50 transition-colors text-sm font-body"
            >
              Remove
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--parchment-dim)] hover:text-[var(--parchment)] transition-colors text-sm font-body"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || (mode !== 'connect' && !name.trim()) || (mode === 'connect' && connectTo === 'existing' && !selectedExistingId) || (mode === 'connect' && connectTo === 'new' && !name.trim())}
            className="px-5 py-2 rounded-lg font-body text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--gold)',
              color: 'var(--bark-900)',
              fontWeight: 600,
            }}
          >
            {loading ? 'Saving…' : mode === 'connect' ? 'Connect' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
