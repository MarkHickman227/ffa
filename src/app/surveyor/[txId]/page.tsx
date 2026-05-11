'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'

interface Item {
  id: string; room: string; description: string; itemType: string; status: string; riskFlag: string; estimatedValue?: number; notes?: string
}

export default function SurveyorViewPage() {
  const { txId } = useParams<{ txId: string }>()
  const [items, setItems] = useState<Item[]>([])
  const [discrepancies, setDiscrepancies] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/transactions/${txId}/fixtures`)
      .then((r) => r.json())
      .then(setItems)
      .finally(() => setLoading(false))
  }, [txId])

  const rooms = Array.from(new Set(items.map((i) => i.room)))

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Surveyor View</h1>
          <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded">Read-only</span>
        </div>
        <p className="text-gray-500 text-sm mb-6">
          You have read-only access to the Fixtures & Fittings schedule. Flag any discrepancies below.
        </p>

        {rooms.map((room) => (
          <div key={room} className="mb-6">
            <h2 className="font-semibold text-gray-800 mb-2">{room}</h2>
            <div className="space-y-3">
              {items.filter((i) => i.room === room).map((item) => (
                <div key={item.id} className="bg-white rounded-xl border shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{item.description}</p>
                      <p className="text-xs text-gray-500">{item.itemType}</p>
                      {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        label={item.status}
                        variant={item.status === 'INCLUDED' ? 'green' : item.status === 'EXCLUDED' ? 'red' : 'amber'}
                      />
                      {item.riskFlag !== 'NONE' && (
                        <Badge label={item.riskFlag + ' RISK'} variant={item.riskFlag === 'HIGH' ? 'red' : item.riskFlag === 'MEDIUM' ? 'amber' : 'blue'} />
                      )}
                    </div>
                  </div>
                  {item.estimatedValue && (
                    <p className="text-xs text-gray-500 mb-2">Estimated value: £{item.estimatedValue}</p>
                  )}
                  <div className="mt-2">
                    <label className="text-xs font-medium text-gray-600">Discrepancy note (visible to conveyancer)</label>
                    <textarea
                      placeholder="Note any discrepancy between the schedule and physical inspection…"
                      value={discrepancies[item.id] ?? ''}
                      onChange={(e) => setDiscrepancies((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      rows={2}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
