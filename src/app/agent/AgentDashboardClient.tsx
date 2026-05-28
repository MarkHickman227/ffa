'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SignOutButton } from '@/components/SignOutButton'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SELLER_FORM_IN_PROGRESS: 'Seller in progress',
  SELLER_FORM_SUBMITTED: 'Seller submitted',
  BUYER_REVIEW: 'Buyer reviewing',
  BUYER_ACCEPTED: 'Buyer accepted',
  EXCHANGE_COMPLETE: 'Exchanged',
  ARCHIVED: 'Archived',
}

interface Transaction {
  id: string
  reference: string
  status: string
  property: { addressLine1: string; city: string; postcode: string }
  seller: { firstName: string; lastName: string }
}

export function AgentDashboardClient({
  transactions,
  userName,
}: {
  transactions: Transaction[]
  userName: string
}) {
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  const visible = transactions.filter((tx) => !removed.has(tx.id))

  function toggleComplete(id: string) {
    setCompleted((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">FFA</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Agent Dashboard</h1>
              <p className="text-sm text-gray-500">{userName}</p>
            </div>
          </div>
          <SignOutButton />
        </div>

        {visible.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
            No transactions available.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((tx) => {
              const done = completed.has(tx.id)
              return (
                <div
                  key={tx.id}
                  className={`bg-white rounded-xl shadow p-5 flex items-center gap-3 transition-opacity ${done ? 'opacity-50' : ''}`}
                >
                  {/* Clickable transaction info */}
                  <Link href={`/agent/${tx.id}`} className="flex-1 min-w-0 block">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-blue-900">{tx.reference}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                            {STATUS_LABEL[tx.status] ?? tx.status}
                          </span>
                          {done && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">
                              Completed
                            </span>
                          )}
                        </div>
                        <p className="text-gray-800 font-medium truncate">
                          {tx.property.addressLine1}, {tx.property.city} {tx.property.postcode}
                        </p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Seller: {tx.seller.firstName} {tx.seller.lastName}
                        </p>
                      </div>
                      <span className="text-gray-400 text-lg flex-shrink-0">→</span>
                    </div>
                  </Link>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleComplete(tx.id)}
                      className={`text-xs font-medium border px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                        done
                          ? 'text-gray-600 border-gray-200 bg-gray-50 hover:bg-gray-100'
                          : 'text-green-700 border-green-200 bg-green-50 hover:bg-green-100'
                      }`}
                    >
                      {done ? 'Undo' : 'Complete'}
                    </button>
                    <button
                      onClick={() => setRemoved((prev) => new Set([...prev, tx.id]))}
                      className="text-xs font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg transition whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
