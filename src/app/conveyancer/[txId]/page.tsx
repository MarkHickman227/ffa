'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'

type Tab = 'overview' | 'fixtures' | 'changelog' | 'riskflags' | 'enquiries' | 'export'

interface Item {
  id: string; room: string; description: string; status: string; riskFlag: string
  riskFlagDismissedAt?: string; estimatedValue?: number; signedPhotoUrls?: string[]
}
interface ChangeLog {
  id: string; fixturesItemId: string; fieldName: string; oldValue?: string; newValue?: string; changedByUserId: string; changedAt: string
}
interface Enquiry {
  id: string; question: string; answer?: string; status: string; raisedByUserId: string; createdAt: string; routing?: string
}
interface Transaction {
  id: string; reference: string; status: string
  jobNumber?: string; contractId?: string
  property: { addressLine1: string; addressLine2?: string; city: string; postcode: string }
  seller: { firstName: string; lastName: string; email: string; phone?: string }
  buyer?: { firstName: string; lastName: string; email: string; phone?: string } | null
  sellerContactAddress?: string
  agentContactName?: string; agentPhone?: string; agentEmail?: string
  buyerSolicitorName?: string; buyerSolicitorPhone?: string; buyerSolicitorEmail?: string
  buyerContactAddress?: string
}

const RISK_BADGE: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = {
  HIGH: 'red', MEDIUM: 'amber', LOW: 'blue', NONE: 'gray',
}

export default function ConveyancerDashboard() {
  const params = useParams()
  const txId = params?.txId as string
  const [tab, setTab] = useState<Tab>('overview')
  const [tx, setTx] = useState<Transaction | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [changelog, setChangelog] = useState<ChangeLog[]>([])
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissReason, setDismissReason] = useState<Record<string, string>>({})
  const [answerText, setAnswerText] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [reopenReason, setReopenReason] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/transactions/${txId}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/transactions/${txId}/fixtures`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/changelog`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/enquiries`).then((r) => r.json()),
    ]).then(([t, f, c, e]) => {
      setTx(t); setItems(f); setChangelog(c); setEnquiries(e)
    }).finally(() => setLoading(false))
  }, [txId])

  const riskItems = items.filter((i) => i.riskFlag !== 'NONE' && !i.riskFlagDismissedAt)

  async function dismissRiskFlag(itemId: string) {
    const reason = dismissReason[itemId]
    if (!reason || reason.length < 10) { alert('Reason must be at least 10 characters'); return }
    const res = await fetch(`/api/transactions/${txId}/risk-flags/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) {
      setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, riskFlagDismissedAt: new Date().toISOString() } : i))
    }
  }

  async function answerEnquiry(enquiryId: string) {
    const answer = answerText[enquiryId]
    if (!answer) return
    const res = await fetch(`/api/transactions/${txId}/enquiries/${enquiryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    })
    if (res.ok) {
      setEnquiries((prev) => prev.map((e) => e.id === enquiryId ? { ...e, answer, status: 'ANSWERED' } : e))
      setAnswerText((prev) => { const { [enquiryId]: _, ...rest } = prev; return rest })
    }
  }

  function openPrint() {
    window.open(`/conveyancer/${txId}/print`, '_blank')
  }

  async function doAction(endpoint: string, body?: Record<string, string>) {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/transactions/${txId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) { setActionError(data.error ?? 'Action failed'); return }
      // Refresh transaction status
      const updated = await fetch(`/api/transactions/${txId}`).then((r) => r.ok ? r.json() : null)
      if (updated) setTx(updated)
    } finally {
      setActionLoading(false)
    }
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'fixtures', label: 'Fixtures List', count: items.length },
    { id: 'changelog', label: 'Change Log', count: changelog.length },
    { id: 'riskflags', label: 'Risk Flags', count: riskItems.length },
    { id: 'enquiries', label: 'Enquiries', count: enquiries.filter((e) => e.status === 'OPEN').length },
    { id: 'export', label: 'Export PDF' },
  ]

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  const address = tx?.property
    ? `${tx.property.addressLine1}${tx.property.addressLine2 ? ', ' + tx.property.addressLine2 : ''}, ${tx.property.city} ${tx.property.postcode}`
    : null

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/conveyancer" className="text-sm text-blue-600 hover:underline">← All transactions</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-0.5">
          {address ?? 'Conveyancer Dashboard'}
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          {tx ? `${tx.reference} · ${tx.status.replace(/_/g, ' ')}` : txId}
        </p>

        {/* ── Status-conditional action bar ─────────────────────── */}
        {tx && (() => {
          const s = tx.status
          const actions: React.ReactNode[] = []

          if (s === 'SELLER_FORM_SUBMITTED') {
            actions.push(
              <button key="fwd" onClick={() => doAction('forward-to-buyer')} disabled={actionLoading}
                className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition">
                Forward to Buyer
              </button>,
              <button key="reopen" onClick={() => setShowReopenModal(true)} disabled={actionLoading}
                className="border border-amber-400 text-amber-700 bg-amber-50 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-100 disabled:opacity-40 transition">
                Request Revision
              </button>,
            )
          }
          if (s === 'BUYER_REVIEW') {
            actions.push(
              <button key="rq" onClick={() => doAction('route-questions')} disabled={actionLoading}
                className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition">
                Route Questions to Seller
              </button>,
              <button key="rr" onClick={() => doAction('route-rejections')} disabled={actionLoading}
                className="border border-red-400 text-red-700 bg-red-50 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-100 disabled:opacity-40 transition">
                Route Rejections to Seller
              </button>,
            )
          }
          if (s === 'BUYER_ACCEPTED') {
            actions.push(
              <button key="dist" onClick={() => doAction('distribute')} disabled={actionLoading}
                className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-600 disabled:opacity-40 transition">
                Distribute Final Schedule
              </button>,
            )
          }

          if (actions.length === 0) return null
          return (
            <div className="bg-white border rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Actions</p>
              <div className="flex flex-wrap gap-3">
                {actions}
              </div>
              {actionError && <p className="text-red-600 text-sm mt-3">{actionError}</p>}
            </div>
          )
        })()}

        {/* Tab bar */}
        <div className="flex gap-1 bg-white border rounded-xl p-1 mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                tab === t.id ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === t.id ? 'bg-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ─────────────────────────────────────────── */}
        {tab === 'overview' && tx && (
          <div className="space-y-5">

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Items', value: items.length },
                { label: 'Included', value: items.filter((i) => i.status === 'INCLUDED').length },
                { label: 'Excluded', value: items.filter((i) => i.status === 'EXCLUDED').length },
                { label: 'Risk Flags', value: riskItems.length },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-xl border shadow-sm p-4">
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Two-column detail cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Job / Transaction */}
              <InfoCard title="Transaction">
                <Row label="Reference">{tx.reference}</Row>
                {tx.jobNumber && <Row label="Job Number">{tx.jobNumber}</Row>}
                {tx.contractId && <Row label="Contract ID">{tx.contractId}</Row>}
                <Row label="Status">{tx.status.replace(/_/g, ' ')}</Row>
              </InfoCard>

              {/* Selling address */}
              <InfoCard title="Selling Address">
                <Row label="Address">
                  {tx.property.addressLine1}
                  {tx.property.addressLine2 && <>, {tx.property.addressLine2}</>}
                  <br />{tx.property.city}, {tx.property.postcode}
                </Row>
              </InfoCard>

              {/* Seller */}
              <InfoCard title="Seller">
                <Row label="Name">{tx.seller.firstName} {tx.seller.lastName}</Row>
                <Row label="Email"><a href={`mailto:${tx.seller.email}`} className="text-blue-600 hover:underline">{tx.seller.email}</a></Row>
                {tx.seller.phone && <Row label="Phone">{tx.seller.phone}</Row>}
                {tx.sellerContactAddress && <Row label="Contact Address">{tx.sellerContactAddress}</Row>}
              </InfoCard>

              {/* Estate Agent */}
              <InfoCard title="Estate Agent">
                {tx.agentContactName
                  ? <>
                      <Row label="Contact">{tx.agentContactName}</Row>
                      {tx.agentPhone && <Row label="Phone">{tx.agentPhone}</Row>}
                      {tx.agentEmail && <Row label="Email"><a href={`mailto:${tx.agentEmail}`} className="text-blue-600 hover:underline">{tx.agentEmail}</a></Row>}
                    </>
                  : <p className="text-sm text-gray-400 italic">Not yet recorded</p>
                }
              </InfoCard>

              {/* Buyer's Solicitor */}
              <InfoCard title="Buyer's Solicitor">
                {tx.buyerSolicitorName
                  ? <>
                      <Row label="Contact">{tx.buyerSolicitorName}</Row>
                      {tx.buyerSolicitorPhone && <Row label="Phone">{tx.buyerSolicitorPhone}</Row>}
                      {tx.buyerSolicitorEmail && <Row label="Email"><a href={`mailto:${tx.buyerSolicitorEmail}`} className="text-blue-600 hover:underline">{tx.buyerSolicitorEmail}</a></Row>}
                    </>
                  : <p className="text-sm text-gray-400 italic">Not yet recorded</p>
                }
              </InfoCard>

              {/* Buyer */}
              <InfoCard title="Buyer">
                {tx.buyer
                  ? <>
                      <Row label="Name">{tx.buyer.firstName} {tx.buyer.lastName}</Row>
                      <Row label="Email"><a href={`mailto:${tx.buyer.email}`} className="text-blue-600 hover:underline">{tx.buyer.email}</a></Row>
                      {tx.buyer.phone && <Row label="Phone">{tx.buyer.phone}</Row>}
                      {tx.buyerContactAddress && <Row label="Contact Address">{tx.buyerContactAddress}</Row>}
                    </>
                  : <p className="text-sm text-gray-400 italic">Not yet added</p>
                }
              </InfoCard>

            </div>
          </div>
        )}

        {/* ── Fixtures List ─────────────────────────────────────── */}
        {tab === 'fixtures' && (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className={`bg-white rounded-xl border shadow-sm p-4 ${item.riskFlag !== 'NONE' && !item.riskFlagDismissedAt ? 'border-amber-200' : ''}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-500">{item.room}</p>
                    {item.estimatedValue && <p className="text-xs text-gray-400 mt-0.5">£{item.estimatedValue}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge label={item.status} variant={item.status === 'INCLUDED' ? 'green' : item.status === 'EXCLUDED' ? 'red' : 'amber'} />
                    {item.riskFlag !== 'NONE' && <Badge label={item.riskFlag} variant={RISK_BADGE[item.riskFlag]} />}
                  </div>
                </div>
                {item.signedPhotoUrls && item.signedPhotoUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.signedPhotoUrls.map((url, i) => (
                      <img key={i} src={url} alt={`Photo ${i + 1}`}
                        className="w-20 h-16 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-90"
                        onClick={() => window.open(url, '_blank')}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Change Log ─────────────────────────────────────────── */}
        {tab === 'changelog' && (
          <div>
            <div className="flex justify-end mb-3">
              <a
                href={`/api/transactions/${txId}/changelog?format=csv`}
                className="text-sm text-blue-600 hover:underline"
              >
                Export CSV
              </a>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3">Field</th>
                    <th className="text-left px-4 py-3">Old Value</th>
                    <th className="text-left px-4 py-3">New Value</th>
                    <th className="text-left px-4 py-3">Changed At</th>
                  </tr>
                </thead>
                <tbody>
                  {changelog.map((log) => (
                    <tr key={log.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{log.fieldName}</td>
                      <td className="px-4 py-3 text-gray-400">{log.oldValue ?? '—'}</td>
                      <td className="px-4 py-3">{log.newValue ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(log.changedAt).toLocaleString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Risk Flags ────────────────────────────────────────── */}
        {tab === 'riskflags' && (
          <div className="space-y-4">
            {riskItems.length === 0 && <p className="text-gray-400 italic">No active risk flags</p>}
            {riskItems.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.description}</p>
                    <p className="text-sm text-gray-500">{item.room}</p>
                  </div>
                  <Badge label={item.riskFlag} variant={RISK_BADGE[item.riskFlag]} />
                </div>
                <div className="flex gap-2">
                  <input
                    placeholder="Reason for dismissal (min 10 chars)"
                    value={dismissReason[item.id] ?? ''}
                    onChange={(e) => setDismissReason((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => dismissRiskFlag(item.id)}
                    className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Enquiries ─────────────────────────────────────────── */}
        {tab === 'enquiries' && (
          <div className="space-y-4">
            {enquiries.map((enq) => (
              <div key={enq.id} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{enq.question}</p>
                    {enq.routing === 'AGENT' && (
                      <p className="text-xs text-purple-600 mt-0.5">Routed to estate agent</p>
                    )}
                  </div>
                  <Badge label={enq.status} variant={enq.status === 'ANSWERED' ? 'green' : enq.status === 'CLOSED' ? 'gray' : 'amber'} />
                </div>
                <p className="text-xs text-gray-400 mb-3">{new Date(enq.createdAt).toLocaleString('en-GB')}</p>
                {enq.status === 'OPEN' && (
                  <div className="flex gap-2">
                    <input
                      placeholder="Your answer…"
                      value={answerText[enq.id] ?? ''}
                      onChange={(e) => setAnswerText((prev) => ({ ...prev, [enq.id]: e.target.value }))}
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => answerEnquiry(enq.id)}
                      className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800"
                    >
                      Answer
                    </button>
                  </div>
                )}
                {enq.answer && (
                  <div className="bg-gray-50 rounded p-2 text-sm text-gray-700">
                    <span className="font-medium">Answer: </span>{enq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Export PDF ────────────────────────────────────────── */}
        {tab === 'export' && (
          <div className="bg-white rounded-xl border shadow-sm p-8 max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Print / Save TA10</h2>
            <p className="text-sm text-gray-500 mb-6">
              Opens the full TA10 document — including all fixtures items, photos, legal acknowledgement,
              and buyer acceptance — in a new window ready to print or save as PDF.
            </p>
            <div className="space-y-3">
              <button
                onClick={openPrint}
                className="w-full bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 transition"
              >
                Open Print View
              </button>
              <p className="text-xs text-gray-400 text-center">
                In the print window: choose your printer, or select &ldquo;Save as PDF&rdquo; in the print dialog.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Reopen / Request Revision modal ──────────────────── */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Request Seller Revision</h2>
            <p className="text-sm text-gray-500 mb-4">Explain to the seller what needs to be changed.</p>
            <textarea
              autoFocus
              rows={4}
              placeholder="Reason for revision request…"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowReopenModal(false); setReopenReason('') }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!reopenReason.trim()) return
                  setShowReopenModal(false)
                  await doAction('reopen', { reason: reopenReason })
                  setReopenReason('')
                }}
                disabled={!reopenReason.trim() || actionLoading}
                className="flex-1 bg-amber-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-40 transition"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 pb-2 border-b">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-32 flex-shrink-0 text-gray-400 font-medium">{label}</dt>
      <dd className="text-gray-900 flex-1">{children}</dd>
    </div>
  )
}
