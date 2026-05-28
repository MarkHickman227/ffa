'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'

interface Transaction {
  id: string; reference: string; status: string
  property: { addressLine1: string; addressLine2?: string; city: string; postcode: string }
  seller: { firstName: string; lastName: string }
}
interface Item {
  id: string; room: string; description: string; status: string; estimatedValue?: number
}
interface Enquiry {
  id: string; question: string; answer?: string; status: string; routing: string; createdAt: string
}

const RECON_BADGE: Record<string, 'green' | 'red' | 'amber'> = {
  MATCHED: 'green', CONFLICT: 'red', UNMATCHED: 'amber',
}

export default function AgentPortalPage() {
  const params = useParams()
  const txId = params?.txId as string
  const [tx, setTx] = useState<Transaction | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [answerText, setAnswerText] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/transactions/${txId}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/transactions/${txId}/fixtures`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/transactions/${txId}/enquiries`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/transactions/${txId}/reconciliation`).then((r) => r.ok ? r.json() : { results: [] }),
    ]).then(([t, f, e, rec]) => {
      setTx(t)
      setItems(Array.isArray(f) ? f : [])
      setEnquiries(Array.isArray(e) ? e : [])
      if (rec.results?.length > 0) setResults(rec.results)
    }).finally(() => setLoading(false))
  }, [txId])

  const agentEnquiries = enquiries.filter((e) => e.routing === 'AGENT')
  const itemById = (id: string) => items.find((i) => i.id === id)

  async function runReconciliation() {
    setRunning(true)
    const res = await fetch(`/api/transactions/${txId}/reconciliation`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setResults(data.results)
    }
    setRunning(false)
  }

  async function answerEnquiry(enquiryId: string) {
    const answer = answerText[enquiryId]
    if (!answer?.trim()) return
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

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  const address = tx?.property
    ? `${tx.property.addressLine1}${tx.property.addressLine2 ? ', ' + tx.property.addressLine2 : ''}, ${tx.property.city} ${tx.property.postcode}`
    : txId

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-1">
          <Link href="/agent" className="text-sm text-blue-600 hover:underline">← All transactions</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-0.5">{address}</h1>
        {tx && (
          <p className="text-gray-500 text-sm mb-6">
            {tx.reference} · {tx.status.replace(/_/g, ' ')} · Seller: {tx.seller.firstName} {tx.seller.lastName}
          </p>
        )}

        {/* Agent enquiries */}
        {agentEnquiries.length > 0 && (
          <div className="bg-white rounded-xl border shadow-sm mb-6">
            <div className="px-4 py-3 border-b bg-amber-50 rounded-t-xl">
              <h2 className="font-semibold text-amber-800 text-sm">
                Enquiries routed to you ({agentEnquiries.filter((e) => e.status === 'OPEN').length} open)
              </h2>
            </div>
            <div className="divide-y">
              {agentEnquiries.map((enq) => (
                <div key={enq.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm text-gray-900 font-medium">{enq.question}</p>
                    <Badge
                      label={enq.status}
                      variant={enq.status === 'ANSWERED' ? 'green' : enq.status === 'CLOSED' ? 'gray' : 'amber'}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{new Date(enq.createdAt).toLocaleString('en-GB')}</p>
                  {enq.answer && (
                    <div className="bg-gray-50 rounded p-2 text-sm text-gray-700 mb-2">
                      <span className="font-medium">Your answer: </span>{enq.answer}
                    </div>
                  )}
                  {enq.status === 'OPEN' && (
                    <div className="flex gap-2">
                      <input
                        placeholder="Type your answer…"
                        value={answerText[enq.id] ?? ''}
                        onChange={(e) => setAnswerText((prev) => ({ ...prev, [enq.id]: e.target.value }))}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => answerEnquiry(enq.id)}
                        disabled={!answerText[enq.id]?.trim()}
                        className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-40"
                      >
                        Answer
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fixtures + Reconciliation */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl">
              <h2 className="font-semibold text-gray-800 text-sm">TA10 Fixtures ({items.length})</h2>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-4 py-8 text-sm text-gray-400 text-center italic">No items yet</p>
              )}
              {items.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500">{item.room}</p>
                  <span className={`text-xs font-medium ${
                    item.status === 'INCLUDED' ? 'text-green-700' :
                    item.status === 'EXCLUDED' ? 'text-red-600' : 'text-amber-600'
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl flex justify-between items-center">
              <h2 className="font-semibold text-gray-800 text-sm">Reconciliation Results</h2>
              <button
                onClick={runReconciliation}
                disabled={running}
                className="bg-blue-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {running ? 'Running…' : 'Run Reconciliation'}
              </button>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {results.length === 0 && (
                <p className="px-4 py-8 text-sm text-gray-400 text-center italic">
                  Run reconciliation to see results
                </p>
              )}
              {results.map((r, idx) => {
                const item = itemById(r.fixturesItemId)
                return (
                  <div key={idx} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item?.description ?? r.fixturesItemId}</p>
                        {r.conflictNote && <p className="text-xs text-red-600 mt-0.5">{r.conflictNote}</p>}
                      </div>
                      <Badge label={r.reconciliationStatus} variant={RECON_BADGE[r.reconciliationStatus] ?? 'gray'} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {results.filter((r) => r.reconciliationStatus === 'CONFLICT').length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
            {results.filter((r) => r.reconciliationStatus === 'CONFLICT').length} conflict(s) found.
            These must be resolved before exchange.
          </div>
        )}
      </div>
    </main>
  )
}
