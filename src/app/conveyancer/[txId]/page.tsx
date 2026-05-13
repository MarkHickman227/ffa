'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
  id: string; question: string; answer?: string; status: string; raisedByUserId: string; createdAt: string
}

const RISK_BADGE: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = {
  HIGH: 'red', MEDIUM: 'amber', LOW: 'blue', NONE: 'gray',
}

export default function ConveyancerDashboard() {
  const params = useParams()
  const txId = params?.txId as string
  const [tab, setTab] = useState<Tab>('overview')
  const [items, setItems] = useState<Item[]>([])
  const [changelog, setChangelog] = useState<ChangeLog[]>([])
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissReason, setDismissReason] = useState<Record<string, string>>({})
  const [answerText, setAnswerText] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch(`/api/transactions/${txId}/fixtures`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/changelog`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}/enquiries`).then((r) => r.json()),
    ]).then(([f, c, e]) => {
      setItems(f); setChangelog(c); setEnquiries(e)
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

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'fixtures', label: 'Fixtures List', count: items.length },
    { id: 'changelog', label: 'Change Log', count: changelog.length },
    { id: 'riskflags', label: 'Risk Flags', count: riskItems.length },
    { id: 'enquiries', label: 'Enquiries', count: enquiries.filter((e) => e.status === 'OPEN').length },
    { id: 'export', label: 'Export PDF' },
  ]

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Conveyancer Dashboard</h1>
        <p className="text-gray-500 text-sm mb-6">Transaction: {txId}</p>

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
        {tab === 'overview' && (
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
                  <p className="text-sm font-medium text-gray-900">{enq.question}</p>
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
    </main>
  )
}
