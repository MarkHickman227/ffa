'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'

interface Item {
  id: string; room: string; description: string; status: string; riskFlag: string; estimatedValue?: number; notes?: string
}
interface Enquiry {
  id: string; question: string; answer?: string; status: string; fixturesItemId?: string
}

const STATUS_BADGE: Record<string, 'green' | 'red' | 'amber' | 'gray'> = {
  INCLUDED: 'green', EXCLUDED: 'red', NEGOTIABLE: 'amber', REMOVED_PRIOR: 'gray',
}
const RISK_BADGE: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = {
  HIGH: 'red', MEDIUM: 'amber', LOW: 'blue', NONE: 'gray',
}

const ACCEPTANCE_TEXT =
  'I confirm that I have reviewed the Fixtures & Fittings schedule and accept it as part of my purchase of the above property. I understand that this acceptance is legally binding and forms part of the contract of sale.'

export default function BuyerReviewPage() {
  const { txId } = useParams<{ txId: string }>()
  const [items, setItems] = useState<Item[]>([])
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [newQuestion, setNewQuestion] = useState('')
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/transactions/${txId}/fixtures`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/enquiries`).then((r) => r.json()),
    ]).then(([f, e]) => {
      setItems(f)
      setEnquiries(e)
    }).finally(() => setLoading(false))
  }, [txId])

  const openEnquiries = enquiries.filter((e) => e.status === 'OPEN')
  const canAccept = openEnquiries.length === 0 && !accepted

  async function raiseEnquiry() {
    if (!newQuestion.trim()) return
    const res = await fetch(`/api/transactions/${txId}/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: newQuestion, fixturesItemId: selectedItem }),
    })
    if (res.ok) {
      const created = await res.json()
      setEnquiries((prev) => [created, ...prev])
      setNewQuestion('')
      setSelectedItem(null)
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
        <p className="text-gray-600">Your acceptance has been recorded. Your conveyancer will be notified.</p>
      </div>
    </div>
  )

  const rooms = Array.from(new Set(items.map((i) => i.room)))

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fixtures & Fittings Schedule</h1>
            <p className="text-gray-500 text-sm mt-1">{items.length} item(s) — review and raise any enquiries before accepting</p>
          </div>
          <button
            disabled={!canAccept}
            onClick={() => setShowAcceptModal(true)}
            className="bg-green-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 disabled:opacity-40 transition"
            title={openEnquiries.length > 0 ? `${openEnquiries.length} open enquiry(s) must be resolved first` : undefined}
          >
            Accept Schedule
          </button>
        </div>

        {openEnquiries.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
            {openEnquiries.length} open enquiry(s) must be answered before you can accept.
          </div>
        )}

        {/* Items by room */}
        {rooms.map((room) => (
          <div key={room} className="mb-6">
            <h2 className="font-semibold text-gray-800 mb-2">{room}</h2>
            <div className="space-y-2">
              {items.filter((i) => i.room === room).map((item) => (
                <div key={item.id} className="bg-white rounded-xl border p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.description}</p>
                      {item.notes && <p className="text-xs text-gray-500 mt-0.5">{item.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={item.status} variant={STATUS_BADGE[item.status] ?? 'gray'} />
                      {item.riskFlag !== 'NONE' && (
                        <Badge label={`${item.riskFlag} RISK`} variant={RISK_BADGE[item.riskFlag] ?? 'gray'} />
                      )}
                      {item.estimatedValue && (
                        <span className="text-xs text-gray-500">£{item.estimatedValue}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedItem(item.id)}
                    className="mt-2 text-xs text-blue-600 hover:underline"
                  >
                    Raise enquiry about this item
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Enquiries panel */}
        <div className="bg-white rounded-xl border shadow-sm p-6 mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Enquiries ({enquiries.length})</h2>

          <div className="mb-4">
            <textarea
              placeholder="Ask a question about the fixtures schedule…"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {selectedItem && (
              <p className="text-xs text-blue-600 mt-1">
                About item: {items.find((i) => i.id === selectedItem)?.description}{' '}
                <button onClick={() => setSelectedItem(null)} className="underline">clear</button>
              </p>
            )}
            <button
              onClick={raiseEnquiry}
              disabled={!newQuestion.trim()}
              className="mt-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-40"
            >
              Send Enquiry
            </button>
          </div>

          <div className="space-y-3">
            {enquiries.map((enq) => (
              <div key={enq.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-800">{enq.question}</p>
                  <Badge
                    label={enq.status}
                    variant={enq.status === 'ANSWERED' ? 'green' : enq.status === 'CLOSED' ? 'gray' : 'amber'}
                  />
                </div>
                {enq.answer && (
                  <div className="mt-2 bg-gray-50 rounded p-2 text-sm text-gray-700">
                    <span className="font-medium">Answer: </span>{enq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

        {/* Accept modal */}
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
      </div>
    </main>
  )
}
