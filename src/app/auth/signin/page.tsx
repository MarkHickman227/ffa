'use client'

export const dynamic = 'force-dynamic'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function SignInPage() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'magic' | 'credentials'>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await signIn('email', { email, redirect: false, callbackUrl })
    if (res?.error) setError(res.error)
    else setSent(true)
    setLoading(false)
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await signIn('credentials', { email, password, totpCode, redirect: false, callbackUrl })
    if (res?.error) setError('Invalid email, password, or authenticator code.')
    else window.location.href = callbackUrl
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-8">
        <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center mb-6">
          <span className="text-white font-bold">FFA</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-6">Sign in to FFA</h1>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('magic')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'magic' ? 'bg-blue-900 text-white' : 'border text-gray-600 hover:bg-gray-50'}`}
          >
            Magic Link
          </button>
          <button
            onClick={() => setMode('credentials')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'credentials' ? 'bg-blue-900 text-white' : 'border text-gray-600 hover:bg-gray-50'}`}
          >
            Password
          </button>
        </div>

        {mode === 'magic' ? (
          sent ? (
            <div className="text-center">
              <p className="text-green-700 font-medium mb-2">Check your inbox</p>
              <p className="text-sm text-gray-500">A sign-in link has been sent to <strong>{email}</strong>. It expires in 72 hours.</p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send Sign-in Link'}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Authenticator code (if enabled)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="6-digit code"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">
          Use Magic Link if you are a seller or buyer. Password login is for conveyancers and agents.
        </p>
      </div>
    </main>
  )
}
