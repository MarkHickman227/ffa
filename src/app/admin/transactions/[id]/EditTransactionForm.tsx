'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function ResendInviteButton({ txId }: { txId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function resend() {
    setState('sending')
    try {
      const res = await fetch(`/api/transactions/${txId}/resend-invite`, { method: 'POST' })
      setState(res.ok ? 'sent' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={resend}
        disabled={state === 'sending' || state === 'sent'}
        className="text-xs bg-blue-50 border border-blue-300 text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition"
      >
        {state === 'sending' ? 'Sending…' : state === 'sent' ? '✓ Sent' : 'Resend seller invite'}
      </button>
      {state === 'error' && <span className="text-xs text-red-600">Send failed — check email settings</span>}
    </div>
  )
}

interface StaffUser { id: string; firstName: string; lastName: string; email: string; phone?: string | null; role: string }
interface Firm { id: string; name: string }

interface TxData {
  id: string
  reference: string
  status: string
  jobNumber?: string | null
  contractId?: string | null
  conveyancerFirmId?: string | null
  conveyancerUserId?: string | null
  agentUserId?: string | null
  agentContactName?: string | null
  agentPhone?: string | null
  agentEmail?: string | null
  buyerSolicitorName?: string | null
  buyerSolicitorPhone?: string | null
  buyerSolicitorEmail?: string | null
  sellerContactAddress?: string | null
  buyerContactAddress?: string | null
  valuationDate?: string | null
  scheduledExchangeDate?: string | null
  property: { addressLine1: string; addressLine2?: string | null; city: string; postcode: string }
  seller: { firstName: string; lastName: string; email: string; phone?: string | null }
  buyer?: { firstName: string; lastName: string; email: string; phone?: string | null } | null
}

function byRole(users: StaffUser[], role: string) {
  return users.filter((u) => u.role === role)
}

function Input({ label, name, value, onChange, type = 'text', required, readOnly, placeholder }: {
  label: string; name: string; value: string; onChange?: (v: string) => void
  type?: string; required?: boolean; readOnly?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type} name={name} value={value} readOnly={readOnly} required={required}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
      />
    </div>
  )
}

function Select({ label, value, onChange, options, empty, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; empty?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}>
        <option value="">{empty ?? '— Select —'}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Textarea({ label, name, value, onChange, readOnly, placeholder, rows = 3 }: {
  label: string; name: string; value: string; onChange?: (v: string) => void
  readOnly?: boolean; placeholder?: string; rows?: number
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <textarea
        name={name} value={value} readOnly={readOnly} rows={rows} placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${readOnly ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
      />
    </div>
  )
}

export function EditTransactionForm({ tx, firms, staffUsers, isLocked }: {
  tx: TxData; firms: Firm[]; staffUsers: StaffUser[]; isLocked: boolean
}) {
  const router = useRouter()
  const sellers = staffUsers.filter(u => u.role === 'SELLER')
  const [sellerId, setSellerId] = useState('')
  const [form, setForm] = useState({
    addressLine1: tx.property.addressLine1,
    addressLine2: tx.property.addressLine2 ?? '',
    city: tx.property.city,
    postcode: tx.property.postcode,
    jobNumber: tx.jobNumber ?? '',
    contractId: tx.contractId ?? '',
    conveyancerFirmId: tx.conveyancerFirmId ?? '',
    conveyancerUserId: tx.conveyancerUserId ?? '',
    agentUserId: tx.agentUserId ?? '',
    agentContactName: tx.agentContactName ?? '',
    agentPhone: tx.agentPhone ?? '',
    agentEmail: tx.agentEmail ?? '',
    buyerSolicitorName: tx.buyerSolicitorName ?? '',
    buyerSolicitorPhone: tx.buyerSolicitorPhone ?? '',
    buyerSolicitorEmail: tx.buyerSolicitorEmail ?? '',
    sellerContactAddress: tx.sellerContactAddress ?? '',
    buyerContactAddress: tx.buyerContactAddress ?? '',
    valuationDate: tx.valuationDate ? tx.valuationDate.slice(0, 10) : '',
    scheduledExchangeDate: tx.scheduledExchangeDate ? tx.scheduledExchangeDate.slice(0, 10) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null); setSuccess(false)
  }

  function onAgentChange(agentId: string) {
    set('agentUserId', agentId)
    if (!agentId) return
    const agent = staffUsers.find((u) => u.id === agentId)
    if (agent) {
      setForm((prev) => ({
        ...prev,
        agentUserId: agentId,
        agentContactName: `${agent.firstName} ${agent.lastName}`,
        agentEmail: agent.email,
        agentPhone: agent.phone ?? '',
      }))
    }
  }

  function onSolicitorPickerChange(solicitorId: string) {
    if (!solicitorId) return
    const sol = staffUsers.find((u) => u.id === solicitorId)
    if (sol) {
      setForm((prev) => ({
        ...prev,
        buyerSolicitorName: `${sol.firstName} ${sol.lastName}`,
        buyerSolicitorEmail: sol.email,
        buyerSolicitorPhone: sol.phone ?? '',
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSuccess(false)
    try {
      const body: Record<string, string | null> = {
        ...(sellerId ? { sellerId } : {}),
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || null,
        city: form.city,
        postcode: form.postcode,
        jobNumber: form.jobNumber || null,
        contractId: form.contractId || null,
        conveyancerFirmId: form.conveyancerFirmId || null,
        conveyancerUserId: form.conveyancerUserId || null,
        agentUserId: form.agentUserId || null,
        agentContactName: form.agentContactName || null,
        agentPhone: form.agentPhone || null,
        agentEmail: form.agentEmail || null,
        buyerSolicitorName: form.buyerSolicitorName || null,
        buyerSolicitorPhone: form.buyerSolicitorPhone || null,
        buyerSolicitorEmail: form.buyerSolicitorEmail || null,
        sellerContactAddress: form.sellerContactAddress || null,
        buyerContactAddress: form.buyerContactAddress || null,
        valuationDate: form.valuationDate ? new Date(form.valuationDate).toISOString() : null,
        scheduledExchangeDate: form.scheduledExchangeDate ? new Date(form.scheduledExchangeDate).toISOString() : null,
      }
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSuccess(true)
        router.refresh()
      } else {
        const b = await res.json()
        const errMsg = b.error?.formErrors?.[0]
          ?? (typeof b.error === 'string' ? b.error : null)
          ?? (b.error?.fieldErrors ? Object.values(b.error.fieldErrors as Record<string, string[]>).flat()[0] : null)
          ?? 'Save failed'
        setError(errMsg)
      }
    } finally {
      setSaving(false)
    }
  }

  const conveyancers = byRole(staffUsers, 'CONVEYANCER')
  const agents = byRole(staffUsers, 'AGENT')
  const solicitors = byRole(staffUsers, 'BUYER_SOLICITOR')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Transaction Reference */}
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Transaction</p>
        <Input label="Transaction ID" name="reference" value={tx.reference} readOnly />
      </div>

      {/* Seller */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Seller</p>
          {!isLocked && <ResendInviteButton txId={tx.id} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" name="sellerFirstName" value={tx.seller.firstName} readOnly />
          <Input label="Last Name" name="sellerLastName" value={tx.seller.lastName} readOnly />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" name="sellerEmail" type="email" value={tx.seller.email} readOnly />
          <Input label="Phone" name="sellerPhone" type="tel" value={tx.seller.phone ?? ''} readOnly />
        </div>
        {!isLocked && sellers.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Change seller
            </label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Keep current seller —</option>
              {sellers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.email})
                </option>
              ))}
            </select>
            <p className="text-xs text-amber-700 mt-1">
              Selecting a new seller will send them a sign-in link to their form.
            </p>
          </div>
        )}
      </div>

      {/* Buyer — read-only */}
      {tx.buyer && (
        <div className="bg-white rounded-xl shadow p-6 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Buyer (read-only)</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" name="buyerFirstName" value={tx.buyer.firstName} readOnly />
            <Input label="Last Name" name="buyerLastName" value={tx.buyer.lastName} readOnly />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" name="buyerEmail" type="email" value={tx.buyer.email} readOnly />
            <Input label="Phone" name="buyerPhone" type="tel" value={tx.buyer.phone ?? ''} readOnly />
          </div>
          <p className="text-xs text-gray-400">To change buyer details, contact a system administrator.</p>
        </div>
      )}

      {/* Property */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Property Address</p>
        <Input label="Address Line 1" name="addressLine1" value={form.addressLine1} onChange={(v) => set('addressLine1', v)} required readOnly={isLocked} />
        <Input label="Address Line 2" name="addressLine2" value={form.addressLine2} onChange={(v) => set('addressLine2', v)} placeholder="Optional" readOnly={isLocked} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" name="city" value={form.city} onChange={(v) => set('city', v)} required readOnly={isLocked} />
          <Input label="Postcode" name="postcode" value={form.postcode} onChange={(v) => set('postcode', v)} required readOnly={isLocked} />
        </div>
      </div>

      {/* Assigned Staff */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Assigned Staff</p>
        <Select
          label="Conveyancer"
          value={form.conveyancerUserId}
          onChange={(v) => set('conveyancerUserId', v)}
          options={conveyancers.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} (${u.email})` }))}
          empty="— Select conveyancer —"
          disabled={isLocked}
        />
        <Select
          label="Estate Agent"
          value={form.agentUserId}
          onChange={isLocked ? () => {} : onAgentChange}
          options={agents.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} (${u.email})` }))}
          empty="— Select agent —"
          disabled={isLocked}
        />
        <Select
          label="Conveyancer Firm"
          value={form.conveyancerFirmId}
          onChange={(v) => set('conveyancerFirmId', v)}
          options={firms.map((f) => ({ value: f.id, label: f.name }))}
          empty="— No firm —"
          disabled={isLocked}
        />
      </div>

      {/* Reference numbers */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Reference Numbers</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Job Number" name="jobNumber" value={form.jobNumber} onChange={(v) => set('jobNumber', v)} readOnly={isLocked} />
          <Input label="Contract ID" name="contractId" value={form.contractId} onChange={(v) => set('contractId', v)} readOnly={isLocked} />
        </div>
      </div>

      {/* Dates */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Key Dates</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Valuation Date" name="valuationDate" type="date" value={form.valuationDate} onChange={(v) => set('valuationDate', v)} readOnly={isLocked} />
          <Input label="Scheduled Exchange" name="scheduledExchangeDate" type="date" value={form.scheduledExchangeDate} onChange={(v) => set('scheduledExchangeDate', v)} readOnly={isLocked} />
        </div>
      </div>

      {/* Contact Addresses */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Contact Addresses</p>
        <Textarea
          label="Seller Contact Address"
          name="sellerContactAddress"
          value={form.sellerContactAddress}
          onChange={(v) => set('sellerContactAddress', v)}
          placeholder="Seller's correspondence address"
          readOnly={isLocked}
        />
        <Textarea
          label="Buyer Contact Address"
          name="buyerContactAddress"
          value={form.buyerContactAddress}
          onChange={(v) => set('buyerContactAddress', v)}
          placeholder="Buyer's correspondence address"
          readOnly={isLocked}
        />
      </div>

      {/* Agent contact */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Agent Contact Details</p>
        <p className="text-xs text-gray-400 -mt-1">Auto-filled when an Estate Agent is selected above. Edit manually if needed.</p>
        <Input label="Contact Name" name="agentContactName" value={form.agentContactName} onChange={(v) => set('agentContactName', v)} readOnly={isLocked} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" name="agentPhone" value={form.agentPhone} onChange={(v) => set('agentPhone', v)} readOnly={isLocked} />
          <Input label="Email" name="agentEmail" type="email" value={form.agentEmail} onChange={(v) => set('agentEmail', v)} readOnly={isLocked} />
        </div>
      </div>

      {/* Buyer's Solicitor */}
      <div className="bg-white rounded-xl shadow p-6 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Buyer's Solicitor</p>
        {!isLocked && solicitors.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Select from contacts</label>
            <select
              defaultValue=""
              onChange={(e) => onSolicitorPickerChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Pick a buyer's solicitor to auto-fill —</option>
              {solicitors.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
              ))}
            </select>
          </div>
        )}
        <Input label="Name" name="buyerSolicitorName" value={form.buyerSolicitorName} onChange={(v) => set('buyerSolicitorName', v)} readOnly={isLocked} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" name="buyerSolicitorPhone" value={form.buyerSolicitorPhone} onChange={(v) => set('buyerSolicitorPhone', v)} readOnly={isLocked} />
          <Input label="Email" name="buyerSolicitorEmail" type="email" value={form.buyerSolicitorEmail} onChange={(v) => set('buyerSolicitorEmail', v)} readOnly={isLocked} />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={() => router.push('/admin')}
          className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
          Exit Form
        </button>
        {!isLocked && (
          <button type="submit" disabled={saving}
            className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">Changes saved successfully.</p>}
    </form>
  )
}
