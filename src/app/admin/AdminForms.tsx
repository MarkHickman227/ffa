'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Firm { id: string; name: string }
interface StaffUser { id: string; firstName: string; lastName: string; email: string; role: string }

const ROLES = [
  { value: 'SELLER', label: 'Seller' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'AGENT', label: 'Estate Agent' },
  { value: 'BUYER_SOLICITOR', label: "Buyer's Solicitor" },
]
const FIRM_ROLES = new Set(['AGENT'])

function byRole(users: StaffUser[], role: string) {
  return users.filter((u) => u.role === role)
}

function userLabel(u: StaffUser) {
  return `${u.firstName} ${u.lastName} (${u.email})`
}

export function AdminForms({
  firms,
  staffUsers = [],
  defaultTab = 'person',
}: {
  firms: Firm[]
  staffUsers?: StaffUser[]
  defaultTab?: string
}) {
  const [tab, setTab] = useState<'person' | 'transaction'>(defaultTab === 'transaction' ? 'transaction' : 'person')

  return (
    <div>
      <div className="flex gap-1 bg-white rounded-xl shadow p-1 mb-6 w-fit">
        <button
          onClick={() => setTab('person')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
            tab === 'person' ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Add Person
        </button>
        <button
          onClick={() => setTab('transaction')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
            tab === 'transaction' ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Add Transaction
        </button>
      </div>

      <div className="max-w-xl">
        {tab === 'person' && <AddPersonForm firms={firms} />}
        {tab === 'transaction' && <AddTransactionForm firms={firms} staffUsers={staffUsers} />}
      </div>
    </div>
  )
}

// ── Add Person ────────────────────────────────────────────────────────────────

function AddPersonForm({ firms }: { firms: Firm[] }) {
  const router = useRouter()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    role: 'SELLER', firmId: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null); setSuccess(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          firmId: form.firmId || null,
        }),
      })
      if (res.ok) {
        const u = await res.json()
        setSuccess(`${u.firstName} ${u.lastName} (${u.role}) created — default password: Password123!`)
        setForm({ firstName: '', lastName: '', email: '', phone: '', role: 'SELLER', firmId: '' })
        router.refresh()
      } else {
        const b = await res.json()
        setError(typeof b.error === 'string' ? b.error : Object.values(b.error?.fieldErrors ?? {}).flat().join(', ') || 'Failed to create person')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const needsFirm = FIRM_ROLES.has(form.role)

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-base font-bold text-gray-900 mb-1">Add New Person</h2>
      <p className="text-xs text-gray-500 mb-4">
        Creates an account with a temporary password of <code className="bg-gray-100 px-1 rounded">Password123!</code>
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input required placeholder="First name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input required placeholder="Last name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <input required type="email" placeholder="Email address" value={form.email} onChange={(e) => set('email', e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="tel" placeholder="Phone number (optional)" value={form.phone} onChange={(e) => set('phone', e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select required value={form.role} onChange={(e) => set('role', e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {needsFirm && (
          <select value={form.firmId} onChange={(e) => set('firmId', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select firm (optional) —</option>
            {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

        <div className="flex gap-3 pt-1">
          <Link
            href="/admin"
            className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Exit Form
          </Link>
          <button type="submit" disabled={submitting}
            className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
            {submitting ? 'Creating…' : 'Add Person'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Add Transaction ───────────────────────────────────────────────────────────

function AddTransactionForm({ firms, staffUsers }: { firms: Firm[]; staffUsers: StaffUser[] }) {
  const router = useRouter()
  const [form, setForm] = useState({
    addressLine1: '', addressLine2: '', city: '', postcode: '',
    sellerFirstName: '', sellerLastName: '', sellerEmail: '', sellerPhone: '',
    buyerFirstName: '', buyerLastName: '', buyerEmail: '', buyerPhone: '',
    agentUserId: '',
    buyerSolicitorUserId: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null); setSuccess(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(null)
    try {
      // Only include fields with values — empty strings fail UUID validation on the server
      const body: Record<string, string> = {
        addressLine1: form.addressLine1,
        city: form.city,
        postcode: form.postcode,
        sellerEmail: form.sellerEmail,
        sellerFirstName: form.sellerFirstName,
        sellerLastName: form.sellerLastName,
        buyerEmail: form.buyerEmail,
        buyerFirstName: form.buyerFirstName,
        buyerLastName: form.buyerLastName,
      }
      if (form.addressLine2) body.addressLine2 = form.addressLine2
      if (form.sellerPhone) body.sellerPhone = form.sellerPhone
      if (form.buyerPhone) body.buyerPhone = form.buyerPhone
      if (form.agentUserId) body.agentUserId = form.agentUserId
      if (form.buyerSolicitorUserId) body.buyerSolicitorUserId = form.buyerSolicitorUserId

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const tx = await res.json()
        setSuccess(`Transaction ${tx.reference} created. Emails sent to all assigned parties.`)
        setForm({
          addressLine1: '', addressLine2: '', city: '', postcode: '',
          sellerFirstName: '', sellerLastName: '', sellerEmail: '', sellerPhone: '',
          buyerFirstName: '', buyerLastName: '', buyerEmail: '', buyerPhone: '',
          agentUserId: '',
          buyerSolicitorUserId: '',
        })
        router.refresh()
      } else {
        const b = await res.json()
        const fieldErrors = b.error?.fieldErrors
        const msg = b.error?.formErrors?.[0]
          ?? (fieldErrors ? Object.entries(fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join(' | ') : null)
          ?? (typeof b.error === 'string' ? b.error : null)
          ?? 'Failed to create transaction'
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const agents = byRole(staffUsers, 'AGENT')
  const solicitors = byRole(staffUsers, 'BUYER_SOLICITOR')

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-base font-bold text-gray-900 mb-4">Add New Transaction</h2>
      <form onSubmit={handleSubmit} autoComplete="off" className="space-y-5">

        {/* Property */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Property Address</p>
          <div className="space-y-2">
            <input required autoComplete="address-line1" placeholder="Address line 1" value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input autoComplete="address-line2" placeholder="Address line 2 (optional)" value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-2 gap-2">
              <input required autoComplete="address-level2" placeholder="City" value={form.city} onChange={(e) => set('city', e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input required autoComplete="postal-code" placeholder="Postcode" value={form.postcode} onChange={(e) => set('postcode', e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Seller */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Seller</p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input required autoComplete="new-password" placeholder="First name" value={form.sellerFirstName} onChange={(e) => setForm(p => ({ ...p, sellerFirstName: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input required autoComplete="new-password" placeholder="Last name" value={form.sellerLastName} onChange={(e) => setForm(p => ({ ...p, sellerLastName: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <input required autoComplete="new-password" type="email" placeholder="Email address" value={form.sellerEmail} onChange={(e) => setForm(p => ({ ...p, sellerEmail: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input autoComplete="new-password" type="tel" placeholder="Phone number (optional)" value={form.sellerPhone} onChange={(e) => setForm(p => ({ ...p, sellerPhone: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Buyer */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Buyer <span className="text-red-500">*</span></p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input required autoComplete="new-password" placeholder="First name" value={form.buyerFirstName} onChange={(e) => setForm(p => ({ ...p, buyerFirstName: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input required autoComplete="new-password" placeholder="Last name" value={form.buyerLastName} onChange={(e) => setForm(p => ({ ...p, buyerLastName: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <input required autoComplete="new-password" type="email" placeholder="Email address" value={form.buyerEmail} onChange={(e) => setForm(p => ({ ...p, buyerEmail: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input autoComplete="new-password" type="tel" placeholder="Phone number (optional)" value={form.buyerPhone} onChange={(e) => setForm(p => ({ ...p, buyerPhone: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Staff */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Staff</p>

          <StaffPicker
            label="Estate Agent"
            required
            value={form.agentUserId}
            onChange={(v) => set('agentUserId', v)}
            users={agents}
            emptyHint="No agents exist yet — add one via Add Person first."
          />

          <StaffPicker
            label="Buyer's Solicitor"
            value={form.buyerSolicitorUserId}
            onChange={(v) => set('buyerSolicitorUserId', v)}
            users={solicitors}
            emptyHint="No buyer's solicitors exist yet — add one via Add Person first."
          />

        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

        <div className="flex gap-3 pt-1">
          <Link
            href="/admin"
            className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Exit Form
          </Link>
          <button type="submit" disabled={submitting}
            className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
            {submitting ? 'Creating…' : 'Create Transaction'}
          </button>
        </div>
      </form>
    </div>
  )
}

function StaffPicker({ label, required, value, onChange, users, emptyHint }: {
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  users: StaffUser[]
  emptyHint: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— Select {label.toLowerCase()} —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{userLabel(u)}</option>
        ))}
      </select>
      {users.length === 0 && <p className="text-xs text-amber-600 mt-1">{emptyHint}</p>}
    </div>
  )
}
