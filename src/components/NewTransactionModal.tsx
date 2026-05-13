'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function NewTransactionModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    addressLine1: '', addressLine2: '', city: '', postcode: '',
    sellerEmail: '', sellerFirstName: '', sellerLastName: '',
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const tx = await res.json()
        router.push(`/conveyancer/${tx.id}`)
        router.refresh()
      } else {
        const body = await res.json()
        setError(body.error?.formErrors?.[0] ?? body.error ?? 'Failed to create transaction')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition"
      >
        + New Transaction
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">New Transaction</h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Property Address</p>
                <div className="space-y-2">
                  <input
                    required placeholder="Address line 1"
                    value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    placeholder="Address line 2 (optional)"
                    value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required placeholder="City"
                      value={form.city} onChange={(e) => set('city', e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      required placeholder="Postcode"
                      value={form.postcode} onChange={(e) => set('postcode', e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Seller Details</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required placeholder="First name"
                      value={form.sellerFirstName} onChange={(e) => set('sellerFirstName', e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      required placeholder="Last name"
                      value={form.sellerLastName} onChange={(e) => set('sellerLastName', e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <input
                    required type="email" placeholder="Email address"
                    value={form.sellerEmail} onChange={(e) => set('sellerEmail', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => { setOpen(false); setError(null) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={submitting}
                  className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
