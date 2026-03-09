'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const FAMILY_CODE = 'family' // hex 66 61 6D 69 6C 79 = "family"
const ADMIN_EMAIL = 'nataliabern2007nb@gmail.com'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<'code' | 'account' | 'claim'>('code')
  const [familyCode, setFamilyCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [yourName, setYourName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [claimChoice, setClaimChoice] = useState<'existing' | 'new' | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [newMemberName, setNewMemberName] = useState('')

  function checkCode() {
    const input = familyCode.trim().toLowerCase().replace(/\s/g, '')
    // Only accept the hex string (spaces optional)
    if (input === '66616d696c79') {
      setStep('account')
      setCodeError('')
    } else {
      setCodeError('Incorrect code. Ask Natalia if you need it.')
    }
  }

  async function handleRegister() {
    setLoading(true)
    setError('')
    const supabase = createClient()

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError || !data.user) {
      setError(signUpError?.message || 'Sign up failed')
      setLoading(false)
      return
    }

    setUserId(data.user.id)

    // Load existing unclaimed members for claiming
    const { data: membersData } = await supabase
      .from('members')
      .select('id, name, birth_date, birth_year, claimed_by')
      .is('claimed_by', null)
      .order('name')

    setMembers(membersData ?? [])
    setStep('claim')
    setLoading(false)
  }

  async function handleClaim() {
    if (!userId) return
    setLoading(true)
    const supabase = createClient()
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase()

    if (claimChoice === 'existing' && selectedMemberId) {
      // Claim existing profile
      await supabase.from('members').update({
        claimed_by: userId,
        is_admin: isAdmin,
      }).eq('id', selectedMemberId)

    } else if (claimChoice === 'new') {
      // Create new profile and claim it
      await supabase.from('members').insert({
        user_id: userId,
        name: newMemberName || yourName,
        is_root: false,
        is_admin: isAdmin,
        claimed_by: userId,
        position_x: Math.random() * 400,
        position_y: Math.random() * 400,
      })
    }

    // Create user prefs
    await supabase.from('user_prefs').insert({
      user_id: userId,
      has_seen_welcome: false,
      language: 'en',
    })

    router.push('/tree')
  }

  const inputCls = "w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
  const labelCls = "block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5"

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {[600, 900, 1200, 1600].map((size) => (
          <div key={size} className="absolute rounded-full border border-[var(--border)]"
            style={{ width: size, height: size, opacity: 0.3 }} />
        ))}
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🌳</div>
          <h1 className="font-display text-4xl text-[var(--parchment)] mb-2">Roots</h1>
          <p className="text-[var(--parchment-dim)] font-body italic text-sm">Join the family tree (write down the password somewhere safe, I can't access it)</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8">

          {/* Step 1: Family code */}
          {step === 'code' && (
            <>
              <h2 className="font-display text-xl text-[var(--parchment)] mb-2">Enter the family code</h2>
              <p className="text-sm text-[var(--parchment-dim)] font-body italic mb-6">
                Ask Natalia for the code to join.
              </p>
              {codeError && (
                <div className="mb-4 p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-red-300 text-sm font-body">
                  {codeError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Family Code</label>
                  <input type="text" value={familyCode} onChange={e => setFamilyCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && checkCode()}
                    className={inputCls} placeholder="Enter code…" />
                </div>
                <button onClick={checkCode}
                  className="w-full bg-[var(--gold)] hover:bg-[var(--gold-bright)] text-[var(--bark-900)] font-display font-semibold py-3 rounded-lg transition-colors">
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 2: Create account */}
          {step === 'account' && (
            <>
              <h2 className="font-display text-xl text-[var(--parchment)] mb-2">Create your account</h2>
              <p className="text-sm text-[var(--parchment-dim)] font-body italic mb-6">
                Welcome to the family. ✦
              </p>
              {error && (
                <div className="mb-4 p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-red-300 text-sm font-body">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Your Name</label>
                  <input type="text" value={yourName} onChange={e => setYourName(e.target.value)}
                    className={inputCls} placeholder="Full name" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className={inputCls} placeholder="you@example.com" />
                </div>
                <div>
                  <label className={labelCls}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    minLength={6} className={inputCls} placeholder="Min. 6 characters" />
                </div>
                <button onClick={handleRegister} disabled={loading || !email || !password}
                  className="w-full bg-[var(--gold)] hover:bg-[var(--gold-bright)] text-[var(--bark-900)] font-display font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Creating account…' : 'Continue'}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Claim a profile */}
          {step === 'claim' && (
            <>
              <h2 className="font-display text-xl text-[var(--parchment)] mb-2">Claim your profile</h2>
              <p className="text-sm text-[var(--parchment-dim)] font-body italic mb-6">
                Are you already on the tree? Claim your box, or create a new one.
              </p>
              <div className="space-y-3 mb-6">
                <button onClick={() => setClaimChoice('existing')}
                  style={{ background: claimChoice === 'existing' ? '#c49040' : 'transparent', color: claimChoice === 'existing' ? '#1a1208' : '#b8a882', border: `1px solid ${claimChoice === 'existing' ? '#c49040' : '#3a3020'}` }}
                  className="w-full py-3 rounded-lg font-body text-sm transition-all">
                  I'm already on the tree — claim my profile
                </button>
                <button onClick={() => setClaimChoice('new')}
                  style={{ background: claimChoice === 'new' ? '#c49040' : 'transparent', color: claimChoice === 'new' ? '#1a1208' : '#b8a882', border: `1px solid ${claimChoice === 'new' ? '#c49040' : '#3a3020'}` }}
                  className="w-full py-3 rounded-lg font-body text-sm transition-all">
                  I'm not on the tree yet — create my profile
                </button>
              </div>

              {claimChoice === 'existing' && (
                <div className="mb-4">
                  <label className={labelCls}>Select your profile</label>
                  <select value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)}
                    className={inputCls}>
                    <option value="">— choose your name —</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.birth_year ? ` (b. ${m.birth_year})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {claimChoice === 'new' && (
                <div className="mb-4">
                  <label className={labelCls}>Your name on the tree</label>
                  <input type="text" value={newMemberName || yourName}
                    onChange={e => setNewMemberName(e.target.value)}
                    className={inputCls} placeholder="Full name" />
                </div>
              )}

              {claimChoice && (
                <button onClick={handleClaim} disabled={loading || (claimChoice === 'existing' && !selectedMemberId)}
                  className="w-full bg-[var(--gold)] hover:bg-[var(--gold-bright)] text-[var(--bark-900)] font-display font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Joining…' : 'Enter the tree 🌳'}
                </button>
              )}
            </>
          )}

          <p className="text-center text-sm font-body text-[var(--parchment-dim)] mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--gold)] hover:text-[var(--gold-bright)] transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
