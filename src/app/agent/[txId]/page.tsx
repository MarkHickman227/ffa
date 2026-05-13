'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'

interface Item {
  id: string; room: string; description: string; status: string; estimatedValue?: number
}
interface MarketingItem {
  id: string; fixturesItemId: string; listedInMarketing: boolean; reconciliationStatus: string; conflictNote?: string
}

export default function AgentPortalPage() {
  const params = useParams()
  const txId = params?.txId as string
  const [items, setItems] = useState<Item[]>([])
  const [marketing, setMarketing] = useState<MarketingItem[]>([])
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/transactions/${txId}/fixtures`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/reconciliation`).then((r) => r.ok ? r.json() : { results: [] }),
    ]).then(([f, rec]) => {
      setItems(f)
      if (rec.results?.length > 0) setResults(rec.results)
    }).finally(() => setLoading(false))
  }, [txId])

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

  const RECON_BADGE: Record<string, 'green' | 'red' | 'amber'> = {
    MATCHED: 'green', CONFLICT: 'red', UNMATCHED: 'amber',
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Agent Reconciliation Portal</h1>
        <p className="text-gray-500 text-sm mb-6">Compare TA10 fixtures schedule against your marketing materials.</p>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Left: TA10 fixtures */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl">
              <h2 className="font-semibold text-gray-800 text-sm">TA10 Fixtures ({items.length})</h2>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500">{item.room}</p>
                  <span className={`text-xs font-medium ${item.status === 'INCLUDED' ? 'text-green-700' : item.status === 'EXCLUDED' ? 'text-red-600' : 'text-amber-600'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Reconciliation results */}
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
