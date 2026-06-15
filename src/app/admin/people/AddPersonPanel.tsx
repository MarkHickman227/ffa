'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Firm { id: string; name: string }

const ROLES = [
  { value: 'SELLER', label: 'Seller' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'AGENT', label: 'Estate Agent' },
  { value: 'BUYER_SOLICITOR', label: "Buyer's Solicitor" },
  { value: 'CONVEYANCER', label: 'Conveyancer' },
  { value: 'ADMIN', label: 'Admin' },
]

export function AddPersonPanel({ firms }: { firms: Firm[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', role: 'SELLER', firmId: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm(p => ({ ...p, [field]: value }))
    setError(null); setSuccess(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, firmId: form.firmId || null }),
      })
      if (res.ok) {
        const u = await res.json()
        setSuccess(`${u.firstName} ${u.lastName} added as ${u.role.replace('_', ' ').toLowerCase()}`)
        setForm({ firstName: '', lastName: '', email: '', phone: '', role: 'SELLER', firmId: '' })
        router.refresh()
      } else {
        const b = await res.json()
        setError(typeof b.error === 'string' ? b.error : Object.values(b.error?.fieldErrors ?? {}).flat().join(', ') || 'Failed to add person')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-8">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 transition"
        >
          <span className="text-base leading-none">+</span> Add Person
        </button>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Add New Person</h2>
            <button onClick={() => { setOpen(false); setError(null); setSuccess(null) }}
              className="text-gray-400 hover:text-gray-600 text-sm transition">
              ✕ Close
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">First Name</label>
                <input required placeholder="First name" value={form.firstName} onChange={e => set('firstName', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Last Name</label>
                <input required placeholder="Last name" value={form.lastName} onChange={e => set('lastName', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email Address</label>
              <input required type="email" placeholder="name@example.com" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Phone <span className="normal-case font-normal text-gray-400">(optional)</span></label>
              <input type="tel" placeholder="07700 000000" value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Role</label>
              <select required value={form.role} onChange={e => set('role', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {form.role === 'AGENT' && firms.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Firm <span className="normal-case font-normal text-gray-400">(optional)</span></label>
                <select value={form.firmId} onChange={e => set('firmId', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select firm —</option>
                  {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setOpen(false); setError(null); setSuccess(null) }}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
                {submitting ? 'Adding…' : 'Add Person'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
