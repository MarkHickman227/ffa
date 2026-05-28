'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface FormState {
  jobNumber: string
  contractId: string
  addressLine1: string
  addressLine2: string
  city: string
  postcode: string
  sellerFirstName: string
  sellerLastName: string
  sellerContactAddress: string
  sellerEmail: string
  sellerPhone: string
  agentContactName: string
  agentPhone: string
  agentEmail: string
  buyerSolicitorName: string
  buyerSolicitorPhone: string
  buyerSolicitorEmail: string
  buyerFirstName: string
  buyerLastName: string
  buyerContactAddress: string
  buyerEmail: string
  buyerPhone: string
}

const EMPTY: FormState = {
  jobNumber: '', contractId: '',
  addressLine1: '', addressLine2: '', city: '', postcode: '',
  sellerFirstName: '', sellerLastName: '', sellerContactAddress: '', sellerEmail: '', sellerPhone: '',
  agentContactName: '', agentPhone: '', agentEmail: '',
  buyerSolicitorName: '', buyerSolicitorPhone: '', buyerSolicitorEmail: '',
  buyerFirstName: '', buyerLastName: '', buyerContactAddress: '', buyerEmail: '', buyerPhone: '',
}

export default function NewTransactionPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/transactions/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const tx = await res.json()
        router.push(`/conveyancer/${tx.id}`)
      } else {
        const b = await res.json()
        setError(
          typeof b.error === 'string'
            ? b.error
            : (b.error?.formErrors?.[0] ?? b.error?.fieldErrors
                ? Object.values(b.error.fieldErrors as Record<string, string[]>).flat().join(', ')
                : 'Failed to create transaction'),
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold">FFA</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <Link href="/conveyancer" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
            </div>
            <h1 className="text-xl font-bold text-gray-900">New Transaction Intake</h1>
            <p className="text-sm text-gray-500">Seller&apos;s solicitor intake form</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Job Details ─────────────────────────────────── */}
          <SectionCard title="Job Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Job Number" required>
                <input required placeholder="e.g. JOB-2025-001"
                  value={form.jobNumber} onChange={(e) => set('jobNumber', e.target.value)}
                  className={inp} />
              </Field>
              <Field label="Contract ID">
                <input placeholder="Contract reference (optional)"
                  value={form.contractId} onChange={(e) => set('contractId', e.target.value)}
                  className={inp} />
              </Field>
            </div>
          </SectionCard>

          {/* ── Selling Address ──────────────────────────────── */}
          <SectionCard title="Selling Address">
            <div className="space-y-3">
              <Field label="Address Line 1" required>
                <input required placeholder="House number and street"
                  value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)}
                  className={inp} />
              </Field>
              <Field label="Address Line 2">
                <input placeholder="Flat, building, etc. (optional)"
                  value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)}
                  className={inp} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" required>
                  <input required placeholder="City"
                    value={form.city} onChange={(e) => set('city', e.target.value)}
                    className={inp} />
                </Field>
                <Field label="Postcode" required>
                  <input required placeholder="Postcode"
                    value={form.postcode} onChange={(e) => set('postcode', e.target.value.toUpperCase())}
                    className={inp} />
                </Field>
              </div>
            </div>
          </SectionCard>

          {/* ── Seller Details ───────────────────────────────── */}
          <SectionCard title="Seller Details">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" required>
                  <input required placeholder="First name"
                    value={form.sellerFirstName} onChange={(e) => set('sellerFirstName', e.target.value)}
                    className={inp} />
                </Field>
                <Field label="Last Name" required>
                  <input required placeholder="Last name"
                    value={form.sellerLastName} onChange={(e) => set('sellerLastName', e.target.value)}
                    className={inp} />
                </Field>
              </div>
              <Field label="Contact Address">
                <textarea placeholder="Seller's current home address (if different from selling address)"
                  value={form.sellerContactAddress} rows={2}
                  onChange={(e) => set('sellerContactAddress', e.target.value)}
                  className={ta} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email Address" required>
                  <input required type="email" placeholder="seller@example.com"
                    value={form.sellerEmail} onChange={(e) => set('sellerEmail', e.target.value)}
                    className={inp} />
                </Field>
                <Field label="Phone Number">
                  <input type="tel" placeholder="+44 7700 000000"
                    value={form.sellerPhone} onChange={(e) => set('sellerPhone', e.target.value)}
                    className={inp} />
                </Field>
              </div>
            </div>
          </SectionCard>

          {/* ── Estate Agent ─────────────────────────────────── */}
          <SectionCard title="Estate Agent">
            <div className="space-y-3">
              <Field label="Contact Name">
                <input placeholder="Agent's full name"
                  value={form.agentContactName} onChange={(e) => set('agentContactName', e.target.value)}
                  className={inp} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone Number">
                  <input type="tel" placeholder="Phone"
                    value={form.agentPhone} onChange={(e) => set('agentPhone', e.target.value)}
                    className={inp} />
                </Field>
                <Field label="Email Address">
                  <input type="email" placeholder="agent@example.com"
                    value={form.agentEmail} onChange={(e) => set('agentEmail', e.target.value)}
                    className={inp} />
                </Field>
              </div>
            </div>
          </SectionCard>

          {/* ── Buyer's Solicitor ────────────────────────────── */}
          <SectionCard title="Buyer's Solicitor">
            <div className="space-y-3">
              <Field label="Contact Name">
                <input placeholder="Solicitor's full name"
                  value={form.buyerSolicitorName} onChange={(e) => set('buyerSolicitorName', e.target.value)}
                  className={inp} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone Number">
                  <input type="tel" placeholder="Phone"
                    value={form.buyerSolicitorPhone} onChange={(e) => set('buyerSolicitorPhone', e.target.value)}
                    className={inp} />
                </Field>
                <Field label="Email Address">
                  <input type="email" placeholder="solicitor@example.com"
                    value={form.buyerSolicitorEmail} onChange={(e) => set('buyerSolicitorEmail', e.target.value)}
                    className={inp} />
                </Field>
              </div>
            </div>
          </SectionCard>

          {/* ── Buyer Details ────────────────────────────────── */}
          <SectionCard title="Buyer Details">
            <p className="text-xs text-gray-400 mb-3 -mt-1">Optional — add when known</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name">
                  <input placeholder="First name"
                    value={form.buyerFirstName} onChange={(e) => set('buyerFirstName', e.target.value)}
                    className={inp} />
                </Field>
                <Field label="Last Name">
                  <input placeholder="Last name"
                    value={form.buyerLastName} onChange={(e) => set('buyerLastName', e.target.value)}
                    className={inp} />
                </Field>
              </div>
              <Field label="Contact Address">
                <textarea placeholder="Buyer's current address"
                  value={form.buyerContactAddress} rows={2}
                  onChange={(e) => set('buyerContactAddress', e.target.value)}
                  className={ta} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email Address">
                  <input type="email" placeholder="buyer@example.com"
                    value={form.buyerEmail} onChange={(e) => set('buyerEmail', e.target.value)}
                    className={inp} />
                </Field>
                <Field label="Phone Number">
                  <input type="tel" placeholder="+44 7700 000000"
                    value={form.buyerPhone} onChange={(e) => set('buyerPhone', e.target.value)}
                    className={inp} />
                </Field>
              </div>
            </div>
          </SectionCard>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-4 pb-10">
            <Link href="/conveyancer"
              className="flex-1 text-center border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 transition">
              Cancel
            </Link>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-40 transition">
              {submitting ? 'Creating…' : 'Create Transaction'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

const inp = 'w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const ta  = 'w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide pb-3 mb-4 border-b border-gray-100">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
