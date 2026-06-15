'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Firm { id: string; name: string }
interface StaffUser { id: string; firstName: string; lastName: string; email: string; role: string }

const ROLES = [
  { value: 'SELLER', label: 'Seller' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'AGENT', label: 'Estate Agent' },
  { value: 'BUYER_SOLICITOR', label: "Buyer's Solicitor" },
  { value: 'CONVEYANCER', label: 'Conveyancer' },
  { value: 'ADMIN', label: 'Admin' },
]

const FIRM_ROLES = new Set(['AGENT'])

function byRole(users: StaffUser[], role: string) {
  return users.filter((u) => u.role === role)
}

function userLabel(u: StaffUser) {
  return `${u.firstName} ${u.lastName} (${u.email})`
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}{optional && <span className="ml-1 normal-case font-normal text-gray-400">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const SELECT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

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
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', role: 'SELLER', firmId: '' })
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
        body: JSON.stringify({ ...form, firmId: form.firmId || null }),
      })
      if (res.ok) {
        const u = await res.json()
        setSuccess(`${u.firstName} ${u.lastName} created — temporary password: Password123!`)
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

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-base font-bold text-gray-900 mb-1">Add New Person</h2>
      <p className="text-xs text-gray-500 mb-5">
        A temporary password of <code className="bg-gray-100 px-1 rounded font-mono">Password123!</code> will be set on the account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name">
            <input required placeholder="e.g. Jane" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Last Name">
            <input required placeholder="e.g. Smith" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={INPUT} />
          </Field>
        </div>

        <Field label="Email Address">
          <input required type="email" placeholder="jane.smith@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} className={INPUT} />
        </Field>

        <Field label="Phone" optional>
          <input type="tel" placeholder="07700 000000" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={INPUT} />
        </Field>

        <Field label="Role">
          <select required value={form.role} onChange={(e) => set('role', e.target.value)} className={SELECT}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>

        {FIRM_ROLES.has(form.role) && (
          <Field label="Firm" optional>
            <select value={form.firmId} onChange={(e) => set('firmId', e.target.value)} className={SELECT}>
              <option value="">— Select firm —</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}

        <div className="flex gap-3 pt-2">
          <Link href="/admin" className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
            {submitting ? 'Creating…' : 'Add Person'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Add Transaction ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">{children}</p>
      <div className="flex-1 border-t border-gray-100" />
    </div>
  )
}

function AddTransactionForm({ firms, staffUsers }: { firms: Firm[]; staffUsers: StaffUser[] }) {
  const router = useRouter()
  const [form, setForm] = useState({
    addressLine1: '', addressLine2: '', city: '', postcode: '',
    sellerFirstName: '', sellerLastName: '', sellerEmail: '', sellerPhone: '',
    buyerFirstName: '', buyerLastName: '', buyerEmail: '', buyerPhone: '',
    agentUserId: '', buyerSolicitorUserId: '',
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
        setSuccess(`Transaction ${tx.reference} created. Seller invite email sent.`)
        setForm({
          addressLine1: '', addressLine2: '', city: '', postcode: '',
          sellerFirstName: '', sellerLastName: '', sellerEmail: '', sellerPhone: '',
          buyerFirstName: '', buyerLastName: '', buyerEmail: '', buyerPhone: '',
          agentUserId: '', buyerSolicitorUserId: '',
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
      <h2 className="text-base font-bold text-gray-900 mb-5">Add New Transaction</h2>
      <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">

        <SectionHeading>Property Address</SectionHeading>

        <Field label="Address Line 1">
          <input required autoComplete="new-password" placeholder="e.g. 12 High Street" value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} className={INPUT} />
        </Field>
        <Field label="Address Line 2" optional>
          <input autoComplete="new-password" placeholder="Flat, suite, unit, etc." value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input required autoComplete="new-password" placeholder="e.g. Manchester" value={form.city} onChange={(e) => set('city', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Postcode">
            <input required autoComplete="new-password" placeholder="e.g. M1 1AA" value={form.postcode} onChange={(e) => set('postcode', e.target.value)} className={INPUT} />
          </Field>
        </div>

        <SectionHeading>Seller</SectionHeading>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name">
            <input required autoComplete="new-password" placeholder="e.g. Jane" value={form.sellerFirstName} onChange={(e) => set('sellerFirstName', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Last Name">
            <input required autoComplete="new-password" placeholder="e.g. Smith" value={form.sellerLastName} onChange={(e) => set('sellerLastName', e.target.value)} className={INPUT} />
          </Field>
        </div>
        <Field label="Email Address">
          <input required autoComplete="new-password" type="email" placeholder="seller@example.com" value={form.sellerEmail} onChange={(e) => set('sellerEmail', e.target.value)} className={INPUT} />
        </Field>
        <Field label="Phone" optional>
          <input autoComplete="new-password" type="tel" placeholder="07700 000000" value={form.sellerPhone} onChange={(e) => set('sellerPhone', e.target.value)} className={INPUT} />
        </Field>

        <SectionHeading>Buyer</SectionHeading>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name">
            <input required autoComplete="new-password" placeholder="e.g. John" value={form.buyerFirstName} onChange={(e) => set('buyerFirstName', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Last Name">
            <input required autoComplete="new-password" placeholder="e.g. Jones" value={form.buyerLastName} onChange={(e) => set('buyerLastName', e.target.value)} className={INPUT} />
          </Field>
        </div>
        <Field label="Email Address">
          <input required autoComplete="new-password" type="email" placeholder="buyer@example.com" value={form.buyerEmail} onChange={(e) => set('buyerEmail', e.target.value)} className={INPUT} />
        </Field>
        <Field label="Phone" optional>
          <input autoComplete="new-password" type="tel" placeholder="07700 000000" value={form.buyerPhone} onChange={(e) => set('buyerPhone', e.target.value)} className={INPUT} />
        </Field>

        <SectionHeading>Assigned Staff</SectionHeading>

        <StaffPicker
          label="Estate Agent"
          required
          value={form.agentUserId}
          onChange={(v) => set('agentUserId', v)}
          users={agents}
          emptyHint="No agents yet — add one via Add Person first."
        />
        <StaffPicker
          label="Buyer's Solicitor"
          optional
          value={form.buyerSolicitorUserId}
          onChange={(v) => set('buyerSolicitorUserId', v)}
          users={solicitors}
          emptyHint="No buyer's solicitors yet — add one via Add Person first."
        />

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}

        <div className="flex gap-3 pt-2">
          <Link href="/admin" className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
            {submitting ? 'Creating…' : 'Create Transaction'}
          </button>
        </div>
      </form>
    </div>
  )
}

function StaffPicker({ label, required, optional, value, onChange, users, emptyHint }: {
  label: string
  required?: boolean
  optional?: boolean
  value: string
  onChange: (v: string) => void
  users: StaffUser[]
  emptyHint: string
}) {
  return (
    <Field label={label} optional={optional}>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT}
      >
        <option value="">— Select {label.toLowerCase()} —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{userLabel(u)}</option>
        ))}
      </select>
      {users.length === 0 && <p className="text-xs text-amber-600 mt-1.5">{emptyHint}</p>}
    </Field>
  )
}
