'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [yourName, setYourName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError || !data.user) {
      setError(signUpError?.message || 'Sign up failed')
      setLoading(false)
      return
    }

    // Create the root "you" member
    const { error: insertError } = await supabase.from('members').insert({
      user_id: data.user.id,
      name: yourName,
      is_root: true,
      position_x: 0,
      position_y: 0,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push('/tree')
  }

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
          <h1 className="font-display text-4xl text-[var(--parchment)] mb-2">Family Tree</h1>
          <p className="text-[var(--parchment-dim)] font-body italic text-sm">Begin your story</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-xl text-[var(--parchment)] mb-2">Create account</h2>
          <p className="text-sm text-[var(--parchment-dim)] font-body italic mb-6">
            You'll be the root of your family tree.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-red-300 text-sm font-body">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                Your Name
              </label>
              <input
                type="text"
                value={yourName}
                onChange={e => setYourName(e.target.value)}
                required
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[var(--parchment-dim)] uppercase tracking-widest mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--ink)] font-body text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
                placeholder="Min. 6 characters"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--gold)] hover:bg-[var(--gold-bright)] text-[var(--bark-900)] font-display font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Creating tree…' : 'Plant your tree'}
            </button>
          </form>

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
