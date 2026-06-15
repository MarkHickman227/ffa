'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeletePersonButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        const b = await res.json().catch(() => ({}))
        alert(b.error ?? 'Failed to delete person')
        setConfirming(false)
      }
    } finally {
      setDeleting(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-500 flex-1">Delete {name}?</span>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-500 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition"
        >
          {deleting ? 'Deleting…' : 'Confirm'}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-red-500 hover:text-red-700 transition"
      >
        Delete
      </button>
    </div>
  )
}
