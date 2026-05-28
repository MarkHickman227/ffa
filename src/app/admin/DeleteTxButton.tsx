'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteTxButton({ txId, reference }: { txId: string; reference: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Delete failed')
      }
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
        <span className="text-xs text-gray-500 mr-1">Delete {reference}?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs bg-red-600 text-white px-2 py-1 rounded font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? '…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); setConfirming(true) }}
      className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded transition"
      title="Delete transaction"
    >
      Delete
    </button>
  )
}
