'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Badge } from '@/components/ui/Badge'

interface Item {
  id: string; room: string; description: string; status: string; riskFlag: string
  estimatedValue?: number; notes?: string; signedPhotoUrls?: string[]
}
interface Enquiry {
  id: string; question: string; answer?: string; status: string
  fixturesItemId?: string; routing: string
}

type ItemDecision = 'accept' | 'reject' | null

const STATUS_BADGE: Record<string, 'green' | 'red' | 'amber' | 'gray'> = {
  INCLUDED: 'green', EXCLUDED: 'red', NEGOTIABLE: 'amber', REMOVED_PRIOR: 'gray', FOR_SALE: 'amber',
}
const RISK_BADGE: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = {
  HIGH: 'red', MEDIUM: 'amber', LOW: 'blue', NONE: 'gray',
}

const ACCEPTANCE_TEXT =
  'I confirm that I have reviewed the fixtures and fittings list for this property and I formally accept this list as part of the contract for purchase. I understand that the items listed as included form part of my purchase and any items listed as excluded do not. I acknowledge that this acceptance has been recorded at the date and time shown and at the list version stated above.'

export default function BuyerReviewPage() {
  const params = useParams()
  const txId = params?.txId as string
  const [items, setItems] = useState<Item[]>([])
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({})
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, 'NOT_NEEDED' | 'TOO_EXPENSIVE'>>({})
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectItemId, setRejectItemId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState<'NOT_NEEDED' | 'TOO_EXPENSIVE'>('NOT_NEEDED')
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [showEnquiryModal, setShowEnquiryModal] = useState(false)
  const [enquiryItemId, setEnquiryItemId] = useState<string | null>(null)
  const [enquiryText, setEnquiryText] = useState('')
  const [sendToAgent, setSendToAgent] = useState(false)
  const [sendingEnquiry, setSendingEnquiry] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/transactions/${txId}/fixtures`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/enquiries`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/buyer-responses`).then((r) => r.ok ? r.json() : []),
    ]).then(([f, e, tx, responses]) => {
      setItems(Array.isArray(f) ? f : [])
      setEnquiries(Array.isArray(e) ? e : [])
      if (tx.buyerAcceptedAt) setAccepted(true)
      const loaded: Record<string, ItemDecision> = {}
      for (const r of responses as { itemId: string; response: string }[]) {
        if (r.response === 'accept' || r.response === 'reject') loaded[r.itemId] = r.response
      }
      setDecisions(loaded)
    }).finally(() => setLoading(false))
  }, [txId])

  const openEnquiries = enquiries.filter((e) => e.status === 'OPEN')
  const rejectedItems = Object.values(decisions).filter((d) => d === 'reject').length
  const canAccept = openEnquiries.length === 0 && rejectedItems === 0 && !accepted

  function openEnquiryModal(itemId: string | null, prefill?: string) {
    setEnquiryItemId(itemId)
    setEnquiryText(prefill ?? '')
    setSendToAgent(false)
    setShowEnquiryModal(true)
  }

  async function postDecision(itemId: string, decision: 'accept' | 'reject', rejectionReason?: 'NOT_NEEDED' | 'TOO_EXPENSIVE') {
    const body: Record<string, string> = { itemId, response: decision }
    if (decision === 'reject' && rejectionReason) body.rejectionReason = rejectionReason
    await fetch(`/api/transactions/${txId}/buyer-responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function setDecision(itemId: string, decision: ItemDecision) {
    const current = decisions[itemId] ?? null
    if (current === decision) {
      // Toggle off — clear decision
      setDecisions((prev) => ({ ...prev, [itemId]: null }))
      return
    }
    if (decision === 'reject') {
      // Open reason modal before committing
      setRejectItemId(itemId)
      setRejectReason('NOT_NEEDED')
      setShowRejectModal(true)
      return
    }
    setDecisions((prev) => ({ ...prev, [itemId]: 'accept' }))
    await postDecision(itemId, 'accept')
  }

  async function confirmReject() {
    if (!rejectItemId) return
    setDecisions((prev) => ({ ...prev, [rejectItemId]: 'reject' }))
    setRejectionReasons((prev) => ({ ...prev, [rejectItemId]: rejectReason }))
    setShowRejectModal(false)
    await postDecision(rejectItemId, 'reject', rejectReason)
    const item = items.find((i) => i.id === rejectItemId)
    openEnquiryModal(rejectItemId, `I wish to raise a query about: ${item?.description ?? 'this item'}`)
    setRejectItemId(null)
  }

  async function submitEnquiry() {
    if (!enquiryText.trim()) return
    setSendingEnquiry(true)
    try {
      const routing = sendToAgent ? 'AGENT' : 'SELLER_CONVEYANCER'
      const res = await fetch(`/api/transactions/${txId}/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: enquiryText, fixturesItemId: enquiryItemId, routing }),
      })
      if (res.ok) {
        const created = await res.json()
        setEnquiries((prev) => [created, ...prev])
        if (enquiryItemId) {
          await fetch(`/api/transactions/${txId}/buyer-responses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: enquiryItemId, response: 'enquiry_raised' }),
          })
        }
        setShowEnquiryModal(false)
        setEnquiryText('')
        setEnquiryItemId(null)
      }
    } finally {
      setSendingEnquiry(false)
    }
  }

  async function handleAccept() {
    const res = await fetch(`/api/transactions/${txId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipAddress: 'client', userAgent: navigator.userAgent }),
    })
    if (res.ok) { setAccepted(true); setShowAcceptModal(false) }
    else setError((await res.json()).error)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>

  if (accepted) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow p-8 max-w-lg text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Schedule Accepted</h1>
        <p className="text-gray-600 mb-6">Your acceptance has been recorded. Your conveyancer will be notified.</p>
        <button
          onClick={() => window.open(`/buyer/${txId}/print`, '_blank')}
          className="text-sm text-blue-600 hover:underline"
        >
          Print / save a copy of this schedule
        </button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className="mt-4 w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          Exit
        </button>
      </div>
    </div>
  )

  const rooms = Array.from(new Set(items.map((i) => i.room)))
  const enquiryItem = items.find((i) => i.id === enquiryItemId)

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fixtures & Fittings Schedule</h1>
            <p className="text-gray-500 text-sm mt-1">{items.length} item(s) — review and raise any enquiries before accepting</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="border border-gray-300 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Exit
            </button>
            <button
              onClick={() => openEnquiryModal(null)}
              className="border border-blue-300 text-blue-700 bg-blue-50 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-100 transition"
            >
              Send Enquiries
            </button>
            <button
              onClick={() => window.open(`/buyer/${txId}/print`, '_blank')}
              className="border border-gray-300 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Print / PDF
            </button>
            <button
              disabled={!canAccept}
              onClick={() => setShowAcceptModal(true)}
              className="bg-green-700 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-green-600 disabled:opacity-40 transition"
              title={
                rejectedItems > 0 ? `${rejectedItems} item(s) rejected — raise enquiries to resolve first` :
                openEnquiries.length > 0 ? `${openEnquiries.length} open enquiry(s) must be resolved first` : undefined
              }
            >
              Accept Schedule
            </button>
          </div>
        </div>

        {openEnquiries.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
            {openEnquiries.length} open enquiry(s) must be answered before you can accept.
          </div>
        )}
        {rejectedItems > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-800">
            You have rejected {rejectedItems} item(s). An enquiry must be raised and resolved for each before you can accept.
          </div>
        )}

        <div className="flex gap-3 mb-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span> Accept</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span> Reject (opens enquiry form)</span>
        </div>

        {/* Items by room */}
        {rooms.map((room) => (
          <div key={room} className="mb-6">
            <h2 className="font-semibold text-gray-800 mb-2">{room}</h2>
            <div className="space-y-2">
              {items.filter((i) => i.room === room).map((item) => {
                const decision = decisions[item.id] ?? null
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border p-4 shadow-sm transition ${
                      decision === 'accept' ? 'border-green-300 bg-green-50/30' :
                      decision === 'reject' ? 'border-red-300 bg-red-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{item.description}</p>
                        {item.notes && <p className="text-xs text-gray-500 mt-0.5">{item.notes}</p>}
                        {item.signedPhotoUrls && item.signedPhotoUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {item.signedPhotoUrls.map((url, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i} src={url} alt={`Photo ${i + 1}`}
                                className="w-28 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 shadow-sm"
                                onClick={() => window.open(url, '_blank')}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                        <Badge label={item.status} variant={STATUS_BADGE[item.status] ?? 'gray'} />
                        {item.riskFlag !== 'NONE' && (
                          <Badge label={`${item.riskFlag} RISK`} variant={RISK_BADGE[item.riskFlag] ?? 'gray'} />
                        )}
                        {item.estimatedValue && (
                          <span className="text-xs text-gray-500">£{item.estimatedValue}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => setDecision(item.id, 'accept')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          decision === 'accept'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-700'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Accept
                      </button>
                      <button
                        onClick={() => setDecision(item.id, 'reject')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          decision === 'reject'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'border-gray-200 text-gray-600 hover:border-red-400 hover:text-red-700'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Reject
                      </button>
                      <button
                        onClick={() => openEnquiryModal(item.id)}
                        className="ml-auto flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        Raise enquiry
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Enquiries list */}
        <div className="bg-white rounded-xl border shadow-sm p-6 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Enquiries
              {enquiries.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-400">({enquiries.length})</span>
              )}
            </h2>
            <button
              onClick={() => openEnquiryModal(null)}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-100 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New enquiry
            </button>
          </div>

          <div className="space-y-3">
            {enquiries.map((enq) => (
              <div key={enq.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{enq.question}</p>
                    {enq.routing === 'AGENT' && (
                      <p className="text-xs text-purple-600 mt-0.5">Routed to estate agent</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge
                      label={enq.status}
                      variant={enq.status === 'ANSWERED' ? 'green' : enq.status === 'CLOSED' ? 'gray' : 'amber'}
                    />
                    {enq.status !== 'CLOSED' && (
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/transactions/${txId}/enquiries/${enq.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'close' }),
                          })
                          if (res.ok) {
                            const updated = await res.json()
                            setEnquiries((prev) => prev.map((e) => e.id === enq.id ? updated : e))
                          }
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>
                {enq.answer && (
                  <div className="mt-2 bg-gray-50 rounded p-2 text-sm text-gray-700">
                    <span className="font-medium">Answer: </span>{enq.answer}
                  </div>
                )}
              </div>
            ))}
            {enquiries.length === 0 && (
              <p className="text-sm text-gray-400 italic text-center py-4">No enquiries yet</p>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
      </div>

      {/* ── Enquiry modal ──────────────────────────────────────────── */}
      {showEnquiryModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Raise an Enquiry</h2>
            {enquiryItem ? (
              <p className="text-sm text-blue-700 bg-blue-50 rounded px-3 py-1.5 mb-4">
                About: <span className="font-medium">{enquiryItem.description}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-4">General enquiry about the fixtures schedule</p>
            )}

            <textarea
              autoFocus
              placeholder="Type your question here…"
              value={enquiryText}
              onChange={(e) => setEnquiryText(e.target.value)}
              rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
            />

            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mb-5">
              <input
                type="checkbox"
                checked={sendToAgent}
                onChange={(e) => setSendToAgent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Route to estate agent
              <span className="text-gray-400 text-xs">(otherwise sent to conveyancer)</span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowEnquiryModal(false); setEnquiryText(''); setEnquiryItemId(null) }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitEnquiry}
                disabled={!enquiryText.trim() || sendingEnquiry}
                className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition"
              >
                {sendingEnquiry ? 'Sending…' : 'Send Enquiry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejection reason modal ────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Reason for rejection</h2>
            <p className="text-sm text-gray-500 mb-4">Please select why you are rejecting this item.</p>
            <div className="space-y-3 mb-6">
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="rejectReason"
                  value="NOT_NEEDED"
                  checked={rejectReason === 'NOT_NEEDED'}
                  onChange={() => setRejectReason('NOT_NEEDED')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium text-sm text-gray-900">Not needed</p>
                  <p className="text-xs text-gray-500">I do not require this item as part of the purchase</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="rejectReason"
                  value="TOO_EXPENSIVE"
                  checked={rejectReason === 'TOO_EXPENSIVE'}
                  onChange={() => setRejectReason('TOO_EXPENSIVE')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium text-sm text-gray-900">Too expensive</p>
                  <p className="text-xs text-gray-500">The asking price for this item is too high</p>
                </div>
              </label>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowRejectModal(false); setRejectItemId(null) }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Accept confirmation modal ──────────────────────────────── */}
      {showAcceptModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Acceptance</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-amber-900 leading-relaxed">{ACCEPTANCE_TEXT}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAcceptModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg">
                Cancel
              </button>
              <button onClick={handleAccept} className="flex-1 bg-green-700 text-white py-3 rounded-lg font-semibold hover:bg-green-600">
                I Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
