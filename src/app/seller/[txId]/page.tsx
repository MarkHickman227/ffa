'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ItemStatus, ItemType } from '@prisma/client'

type Screen = 'welcome' | 'rooms' | 'items' | 'review' | 'legal' | 'confirmation'

const TA10_ROOMS = [
  'Kitchen', 'Living Room', 'Dining Room', 'Master Bedroom',
  'Bedroom 2', 'Bedroom 3', 'Bathroom', 'En-suite',
  'Hallway', 'Garden', 'Garage', 'Loft / Attic',
]

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: ItemType.FIXTURE, label: 'Fixture (stays by default)' },
  { value: ItemType.FITTING, label: 'Fitting (leaves by default)' },
  { value: ItemType.KITCHEN_APPLIANCE, label: 'Kitchen Appliance' },
  { value: ItemType.BATHROOM_FITTING, label: 'Bathroom Fitting' },
  { value: ItemType.LIGHT_FITTING, label: 'Light Fitting' },
  { value: ItemType.CARPET_FLOORING, label: 'Carpet / Flooring' },
  { value: ItemType.CURTAIN_BLIND, label: 'Curtain / Blind' },
  { value: ItemType.GARDEN_ITEM, label: 'Garden Item' },
  { value: ItemType.OUTDOOR_STRUCTURE, label: 'Outdoor Structure' },
  { value: ItemType.SMART_HOME, label: 'Smart Home Device' },
  { value: ItemType.SECURITY_SYSTEM, label: 'Security System' },
  { value: ItemType.OTHER, label: 'Other' },
]

const LEGAL_TEXT =
  'I confirm that the information provided in this TA10 Fixtures and Fittings form is accurate and complete to the best of my knowledge. I understand that this forms part of the legal contract for the sale of the property and that providing false information may constitute misrepresentation under the Misrepresentation Act 1967.'

interface FixturesItem {
  id?: string
  room: string
  description: string
  itemType: ItemType
  status: ItemStatus
  estimatedValue?: number
  notes?: string
}

export default function SellerFormPage() {
  const params = useParams()
  const txId = params?.txId as string
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('welcome')
  const [selectedRooms, setSelectedRooms] = useState<string[]>([])
  const [currentRoom, setCurrentRoom] = useState<string>('')
  const [items, setItems] = useState<FixturesItem[]>([])
  const [legalAgreed, setLegalAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-save every 60 seconds on the items screen
  useEffect(() => {
    if (screen === 'items') {
      autoSaveRef.current = setInterval(async () => {
        await saveItems(true)
      }, 60_000)
    } else {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  }, [screen, items])

  async function saveItems(silent = false) {
    for (const item of items.filter((i) => !i.id)) {
      const res = await fetch(`/api/transactions/${txId}/fixtures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (res.ok) {
        const created = await res.json()
        setItems((prev) => prev.map((i) => (i === item ? { ...i, id: created.id } : i)))
      }
    }
    if (!silent) console.log('Saved')
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await saveItems()
      const res = await fetch(`/api/transactions/${txId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipAddress: 'client',
          userAgent: navigator.userAgent,
          legalText: LEGAL_TEXT,
          formVersion: '1.0',
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Submit failed')
      setScreen('confirmation')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function addItem(room: string) {
    setItems((prev) => [
      ...prev,
      { room, description: '', itemType: ItemType.FIXTURE, status: ItemStatus.INCLUDED },
    ])
  }

  const roomItems = (room: string) => items.filter((i) => i.room === room)

  // ── Screens ────────────────────────────────────────────────────────────────
  if (screen === 'welcome') {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-xl shadow p-8">
          <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-6">
            <span className="text-white font-bold text-lg">FFA</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Fixtures & Fittings Form</h1>
          <p className="text-gray-600 mb-6">
            This form (TA10) records which items are included or excluded from your property sale.
            Completing it accurately protects both you and your buyer.
          </p>
          <ul className="space-y-2 mb-8 text-sm text-gray-700">
            <li className="flex gap-2"><span className="text-blue-600">1.</span> Select rooms in your property</li>
            <li className="flex gap-2"><span className="text-blue-600">2.</span> List fixtures and fittings in each room</li>
            <li className="flex gap-2"><span className="text-blue-600">3.</span> Review and confirm the legal declaration</li>
          </ul>
          <button
            onClick={() => setScreen('rooms')}
            className="w-full bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 transition"
          >
            Start Form
          </button>
        </div>
      </main>
    )
  }

  if (screen === 'rooms') {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Select Rooms</h1>
          <p className="text-gray-500 text-sm mb-6">Choose all rooms that apply to your property.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {TA10_ROOMS.map((room) => (
              <button
                key={room}
                onClick={() =>
                  setSelectedRooms((prev) =>
                    prev.includes(room) ? prev.filter((r) => r !== room) : [...prev, room],
                  )
                }
                className={`p-3 rounded-lg border-2 text-sm font-medium transition ${
                  selectedRooms.includes(room)
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-700 hover:border-blue-300'
                }`}
              >
                {room}
              </button>
            ))}
          </div>
          <button
            disabled={selectedRooms.length === 0}
            onClick={() => { setCurrentRoom(selectedRooms[0]); setScreen('items') }}
            className="w-full bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-40 transition"
          >
            Next — Add Items ({selectedRooms.length} room{selectedRooms.length !== 1 ? 's' : ''})
          </button>
        </div>
      </main>
    )
  }

  if (screen === 'items') {
    const roomIdx = selectedRooms.indexOf(currentRoom)
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {selectedRooms.map((room, i) => (
              <button
                key={room}
                onClick={() => setCurrentRoom(room)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                  room === currentRoom ? 'bg-blue-900 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >
                {room} ({roomItems(room).length})
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{currentRoom}</h2>
            <button
              onClick={() => addItem(currentRoom)}
              className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-4 mb-6">
            {roomItems(currentRoom).map((item, idx) => {
              const globalIdx = items.findIndex((i) => i === item)
              return (
                <div key={idx} className="bg-white rounded-xl border p-4 shadow-sm">
                  <div className="grid gap-3">
                    <input
                      placeholder="Description (e.g. Integrated dishwasher)"
                      value={item.description}
                      onChange={(e) => setItems((prev) => prev.map((i, gi) => gi === globalIdx ? { ...i, description: e.target.value } : i))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={item.itemType}
                        onChange={(e) => setItems((prev) => prev.map((i, gi) => gi === globalIdx ? { ...i, itemType: e.target.value as ItemType } : i))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <select
                        value={item.status}
                        onChange={(e) => setItems((prev) => prev.map((i, gi) => gi === globalIdx ? { ...i, status: e.target.value as ItemStatus } : i))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="INCLUDED">Included</option>
                        <option value="EXCLUDED">Excluded</option>
                        <option value="NEGOTIABLE">Negotiable</option>
                        <option value="REMOVED_PRIOR">Removed Prior</option>
                      </select>
                    </div>
                    <input
                      type="number"
                      placeholder="Estimated value (£)"
                      value={item.estimatedValue ?? ''}
                      onChange={(e) => setItems((prev) => prev.map((i, gi) => gi === globalIdx ? { ...i, estimatedValue: Number(e.target.value) || undefined } : i))}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      placeholder="Notes (optional)"
                      value={item.notes ?? ''}
                      rows={2}
                      onChange={(e) => setItems((prev) => prev.map((i, gi) => gi === globalIdx ? { ...i, notes: e.target.value } : i))}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, gi) => gi !== globalIdx))}
                    className="mt-2 text-xs text-red-500 hover:text-red-700"
                  >
                    Remove item
                  </button>
                </div>
              )
            })}
            {roomItems(currentRoom).length === 0 && (
              <p className="text-gray-400 text-sm italic text-center py-8">No items added yet</p>
            )}
          </div>

          <div className="flex gap-3">
            {roomIdx > 0 && (
              <button
                onClick={() => setCurrentRoom(selectedRooms[roomIdx - 1])}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50"
              >
                Previous Room
              </button>
            )}
            {roomIdx < selectedRooms.length - 1 ? (
              <button
                onClick={() => setCurrentRoom(selectedRooms[roomIdx + 1])}
                className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800"
              >
                Next Room
              </button>
            ) : (
              <button
                onClick={() => setScreen('review')}
                className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800"
              >
                Review Summary
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  if (screen === 'review') {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Review Your Form</h1>
          <p className="text-gray-500 text-sm mb-6">{items.length} item(s) across {selectedRooms.length} room(s)</p>

          {selectedRooms.map((room) => (
            <div key={room} className="mb-6">
              <h2 className="font-semibold text-gray-800 mb-2">{room}</h2>
              {roomItems(room).length === 0 ? (
                <p className="text-gray-400 text-sm italic">No items</p>
              ) : (
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2">Description</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomItems(room).map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{item.description || <span className="text-red-400 italic">Missing</span>}</td>
                        <td className="px-3 py-2">{item.status}</td>
                        <td className="px-3 py-2">{item.estimatedValue ? `£${item.estimatedValue}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          <div className="flex gap-3">
            <button onClick={() => setScreen('items')} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg">
              Edit Items
            </button>
            <button onClick={() => setScreen('legal')} className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800">
              Continue to Declaration
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (screen === 'legal') {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-xl shadow p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Legal Declaration</h1>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-900 leading-relaxed">{LEGAL_TEXT}</p>
          </div>
          <label className="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={legalAgreed}
              onChange={(e) => setLegalAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              I have read and I agree to the declaration above.
            </span>
          </label>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setScreen('review')} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg">
              Back
            </button>
            <button
              disabled={!legalAgreed || submitting}
              onClick={handleSubmit}
              className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Submit Form'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  // Confirmation
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-xl shadow p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Form Submitted</h1>
        <p className="text-gray-600 mb-6">
          Your Fixtures & Fittings form has been submitted. Your conveyancer and the buyer will be notified.
        </p>
        <p className="text-sm text-gray-400">You can close this page.</p>
      </div>
    </main>
  )
}
