'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ItemStatus, ItemType } from '@prisma/client'

type Screen = 'welcome' | 'rooms' | 'items' | 'review' | 'legal' | 'confirmation' | 'submitted'

const TA10_ROOMS = [
  'Kitchen', 'Living Room', 'Dining Room', 'Master Bedroom',
  'Bedroom 2', 'Bedroom 3', 'Bathroom', 'En-suite',
  'Hallway', 'Garden', 'Garage', 'Loft / Attic',
]

const TA10_CATEGORIES = [
  'Basic Fittings',
  'Kitchen',
  'Bathroom',
  'Decorative Fittings',
  'TV / Telephone / Broadband',
  'Light Fittings',
  'Garden Items',
  'Outdoor Buildings & Swimming Pools',
  'Central Heating',
  'Fitted Carpets',
  'Electrical Appliances',
  'Other',
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
  'I confirm that the information I have provided in this fixtures and fittings form is accurate and complete to the best of my knowledge and belief. I understand that this information will form part of the contract for the sale of the property and that I may be legally liable for any inaccuracies. I acknowledge that this declaration has been made at the date and time recorded by the platform and from the device identified by my IP address.'

interface FixturesItem {
  id?: string
  room: string
  itemName: string
  description: string
  itemType: ItemType
  status: ItemStatus
  category?: string
  salePrice?: number
  estimatedValue?: number
  notes?: string
  photoUrls: string[]
  signedPhotoUrls: string[]
}

export default function SellerFormPage() {
  const params = useParams()
  const txId = params?.txId as string
  const [screen, setScreen] = useState<Screen>('welcome')
  const [revisionMode, setRevisionMode] = useState(false)
  const [selectedRooms, setSelectedRooms] = useState<string[]>([])
  const [currentRoom, setCurrentRoom] = useState<string>('')
  const [items, setItems] = useState<FixturesItem[]>([])
  const [legalAgreed, setLegalAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modal, setModal] = useState({
    room: '', name: '', notes: '', estimatedValue: '',
    status: 'INCLUDED' as ItemStatus, itemType: 'FIXTURE' as ItemType, category: '',
  })
  const [modalFiles, setModalFiles] = useState<File[]>([])
  const [modalPreviews, setModalPreviews] = useState<string[]>([])
  const [savingModal, setSavingModal] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [customRoom, setCustomRoom] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/transactions/${txId}/fixtures`).then((r) => r.json()),
      fetch(`/api/transactions/${txId}`).then((r) => r.ok ? r.json() : null),
    ]).then(([existing, tx]) => {
      // If already submitted, show read-only view (SELLER_REVISION stays editable)
      if (tx?.status && !['DRAFT', 'SELLER_FORM_IN_PROGRESS', 'SELLER_REVISION'].includes(tx.status)) {
        if (Array.isArray(existing) && existing.length > 0) {
          const mapped = existing.map(mapItem)
          setItems(mapped)
          const rooms = [...new Set(mapped.map((i) => i.room))] as string[]
          setSelectedRooms(rooms)
          setCurrentRoom(rooms[0])
        }
        setScreen('submitted')
        return
      }
      if (tx?.status === 'SELLER_REVISION') setRevisionMode(true)
      if (!Array.isArray(existing) || existing.length === 0) return
      const mapped = existing.map(mapItem)
      setItems(mapped)
      const rooms = [...new Set(mapped.map((i) => i.room))] as string[]
      setSelectedRooms(rooms)
      setCurrentRoom(rooms[0])
      setScreen('items')
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId])

  function mapItem(i: any): FixturesItem {
    return {
      id: i.id as string,
      room: i.room as string,
      itemName: (i.itemName || i.description || '') as string,
      description: (i.description || '') as string,
      itemType: i.itemType as ItemType,
      status: i.status as ItemStatus,
      category: i.category ?? undefined,
      salePrice: i.salePrice != null ? Number(i.salePrice) : undefined,
      estimatedValue: i.estimatedValue != null ? Number(i.estimatedValue) : undefined,
      notes: i.notes ?? undefined,
      photoUrls: (i.photoUrls ?? []) as string[],
      signedPhotoUrls: (i.signedPhotoUrls ?? []) as string[],
    }
  }

  useEffect(() => {
    if (screen === 'items') {
      autoSaveRef.current = setInterval(async () => { await saveItems(true) }, 60_000)
    } else {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, items])

  async function saveItems(silent = false) {
    for (const item of items) {
      const body: Record<string, any> = {
        room: item.room,
        itemName: item.itemName,
        description: item.description,
        itemType: item.itemType,
        status: item.status,
        category: item.category ?? null,
        salePrice: item.status === 'FOR_SALE' ? (item.salePrice ?? null) : null,
        estimatedValue: item.estimatedValue ?? null,
        notes: item.notes ?? null,
        photoUrls: item.photoUrls ?? [],
      }
      if (!item.id) {
        const res = await fetch(`/api/transactions/${txId}/fixtures`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const created = await res.json()
          setItems((prev) => prev.map((i) => (i === item ? { ...i, id: created.id } : i)))
        }
      } else {
        await fetch(`/api/transactions/${txId}/fixtures/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
    }
    if (!silent) console.log('Saved')
  }

  async function deleteItem(globalIdx: number) {
    const item = items[globalIdx]
    if (item.id) {
      await fetch(`/api/transactions/${txId}/fixtures/${item.id}`, { method: 'DELETE' })
    }
    setItems((prev) => prev.filter((_, gi) => gi !== globalIdx))
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
      { room, itemName: '', description: '', itemType: ItemType.FIXTURE, status: ItemStatus.INCLUDED, photoUrls: [], signedPhotoUrls: [] },
    ])
  }

  function updateItem(globalIdx: number, patch: Partial<FixturesItem>) {
    setItems((prev) => prev.map((i, gi) => gi === globalIdx ? { ...i, ...patch } : i))
  }

  function compressImage(file: File, maxWidth = 1200): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = reject
      img.src = objectUrl
    })
  }

  async function handlePhotoUpload(globalIdx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const item = items[globalIdx]
    if (!item.itemName.trim()) {
      alert('Add an item name first before uploading photos.')
      e.target.value = ''
      return
    }
    setUploadingIdx(globalIdx)
    try {
      let itemId = item.id
      if (!itemId) {
        const res = await fetch(`/api/transactions/${txId}/fixtures`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: item.room, itemName: item.itemName || item.description, description: item.description,
            itemType: item.itemType, status: item.status, photoUrls: [],
          }),
        })
        if (!res.ok) throw new Error('Could not save item')
        const created = await res.json()
        itemId = created.id
        setItems((prev) => prev.map((i, gi) => gi === globalIdx ? { ...i, id: created.id } : i))
      }
      const newDataUrls: string[] = []
      for (const file of Array.from(files)) {
        const dataUrl = await compressImage(file)
        newDataUrls.push(dataUrl)
      }
      if (newDataUrls.length > 0) {
        const updatedUrls = [...(item.photoUrls ?? []), ...newDataUrls]
        await fetch(`/api/transactions/${txId}/fixtures/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrls: updatedUrls }),
        })
        setItems((prev) => prev.map((it, gi) => gi === globalIdx
          ? { ...it, photoUrls: updatedUrls, signedPhotoUrls: updatedUrls }
          : it
        ))
      }
    } catch (err: any) {
      alert(err.message ?? 'Photo upload failed')
    } finally {
      setUploadingIdx(null)
      e.target.value = ''
    }
  }

  async function deletePhoto(globalIdx: number, photoIdx: number) {
    const item = items[globalIdx]
    if (!item.id) return
    const key = item.photoUrls[photoIdx]
    setDeletingPhoto(key)
    try {
      const updatedKeys = item.photoUrls.filter((_, i) => i !== photoIdx)
      await fetch(`/api/transactions/${txId}/fixtures/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrls: updatedKeys }),
      })
      setItems((prev) => prev.map((it, gi) => gi === globalIdx
        ? { ...it, photoUrls: updatedKeys, signedPhotoUrls: it.signedPhotoUrls.filter((_, i) => i !== photoIdx) }
        : it
      ))
    } finally {
      setDeletingPhoto(null)
    }
  }

  useEffect(() => {
    if (!showAddRoom) return
    function close(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-add-room]')) setShowAddRoom(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showAddRoom])

  function handleAddRoom(room: string) {
    const trimmed = room.trim()
    if (!trimmed) return
    if (!selectedRooms.includes(trimmed)) {
      setSelectedRooms((prev) => [...prev, trimmed])
    }
    setCurrentRoom(trimmed)
    setShowAddRoom(false)
    setCustomRoom('')
  }

  async function handleRemoveRoom(room: string) {
    const roomItemsList = roomItems(room)
    if (roomItemsList.length > 0) {
      if (!confirm(`Remove "${room}" and delete its ${roomItemsList.length} item(s)?`)) return
      for (const item of roomItemsList) {
        if (item.id) {
          await fetch(`/api/transactions/${txId}/fixtures/${item.id}`, { method: 'DELETE' })
        }
      }
      setItems((prev) => prev.filter((i) => i.room !== room))
    }
    const remaining = selectedRooms.filter((r) => r !== room)
    setSelectedRooms(remaining)
    if (currentRoom === room) setCurrentRoom(remaining[0] ?? '')
  }

  function openAddModal(defaultRoom = '') {
    modalPreviews.forEach((url) => URL.revokeObjectURL(url))
    setModal({ room: defaultRoom || currentRoom || '', name: '', notes: '', estimatedValue: '', status: 'INCLUDED' as ItemStatus, itemType: 'FIXTURE' as ItemType, category: '' })
    setModalFiles([])
    setModalPreviews([])
    setModalError(null)
    setShowModal(true)
  }

  function handleModalFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setModalFiles((prev) => [...prev, ...files])
    setModalPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeModalFile(idx: number) {
    URL.revokeObjectURL(modalPreviews[idx])
    setModalFiles((prev) => prev.filter((_, i) => i !== idx))
    setModalPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleAddFromModal() {
    if (!modal.room || !modal.name.trim()) return
    setSavingModal(true)
    setModalError(null)
    try {
      const body: Record<string, any> = {
        room: modal.room,
        itemName: modal.name.trim(),
        description: modal.notes.trim(),
        itemType: modal.itemType,
        status: modal.status,
        photoUrls: [],
      }
      if (modal.category) body.category = modal.category
      if (modal.estimatedValue) {
        const val = Number(modal.estimatedValue)
        if (modal.status === 'FOR_SALE') body.salePrice = val
        else body.estimatedValue = val
      }

      const res = await fetch(`/api/transactions/${txId}/fixtures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        const msg = typeof errBody.error === 'string'
          ? errBody.error
          : (errBody.error?.formErrors?.[0] ?? `Error ${res.status}`)
        setModalError(msg)
        return
      }

      const created = await res.json()

      // Upload photos if any were attached
      if (modalFiles.length > 0) {
        const dataUrls: string[] = []
        for (const file of modalFiles) {
          dataUrls.push(await compressImage(file))
        }
        if (dataUrls.length > 0) {
          await fetch(`/api/transactions/${txId}/fixtures/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoUrls: dataUrls }),
          })
          created.photoUrls = dataUrls
          created.signedPhotoUrls = dataUrls
        }
      }

      // Add new item directly to state — no second GET needed
      const newItem = mapItem(created)
      setItems((prev) => [...prev, newItem])
      if (!selectedRooms.includes(modal.room)) {
        setSelectedRooms((prev) => [...prev, modal.room])
      }
      setCurrentRoom(modal.room)
      modalPreviews.forEach((url) => URL.revokeObjectURL(url))
      setShowModal(false)
    } catch (err: any) {
      setModalError(err.message ?? 'Failed to add item')
    } finally {
      setSavingModal(false)
    }
  }

  const roomItems = (room: string) => items.filter((i) => i.room === room)

  // ── Screens ───────────────────────────────────────────────────────────────

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
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="w-full mt-3 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Exit
          </button>
        </div>
      </main>
    )
  }

  if (screen === 'submitted') {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Fixtures & Fittings — Submitted</h1>
              <p className="text-sm text-gray-500 mt-1">Your form has been submitted and is now read-only.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.open(`/seller/${txId}/print`, '_blank')}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Print / PDF
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Exit
              </button>
            </div>
          </div>
          {selectedRooms.map((room) => (
            <div key={room} className="mb-5">
              <h2 className="font-semibold text-gray-800 mb-2">{room}</h2>
              {roomItems(room).length === 0 ? (
                <p className="text-gray-400 text-sm italic">No items</p>
              ) : (
                <div className="space-y-2">
                  {roomItems(room).map((item, i) => (
                    <div key={i} className="bg-white border rounded-xl p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{item.itemName || item.description}</p>
                          {item.description && item.itemName && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                          {item.category && <p className="text-xs text-gray-400">{item.category}</p>}
                          {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.status === 'INCLUDED' ? 'bg-green-50 text-green-700' :
                            item.status === 'EXCLUDED' ? 'bg-red-50 text-red-700' :
                            item.status === 'FOR_SALE' ? 'bg-purple-50 text-purple-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>{item.status}</span>
                          {item.status === 'FOR_SALE' && item.salePrice && (
                            <span className="text-xs text-gray-500">Sale price: £{item.salePrice}</span>
                          )}
                          {item.estimatedValue && <span className="text-xs text-gray-500">£{item.estimatedValue}</span>}
                        </div>
                      </div>
                      {item.signedPhotoUrls.length > 0 && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {item.signedPhotoUrls.map((url, pi) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={pi} src={url} alt={`Photo ${pi + 1}`}
                              className="w-28 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 shadow-sm"
                              onClick={() => window.open(url, '_blank')}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
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
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Exit
            </button>
            <button
              disabled={selectedRooms.length === 0}
              onClick={() => { setCurrentRoom(selectedRooms[0]); setScreen('items') }}
              className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-40 transition"
            >
              Next — Add Items ({selectedRooms.length} room{selectedRooms.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (screen === 'items') {
    const roomIdx = selectedRooms.indexOf(currentRoom)
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-2xl mx-auto">
          {revisionMode && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900">
              <strong>Revision requested</strong> — your conveyancer has asked you to review and update this form. Make your changes and re-submit when ready.
            </div>
          )}
          {/* Room tabs with add / remove */}
          <div className="relative mb-6">
            <div className="flex gap-2 overflow-x-auto pb-1 items-center">
              {selectedRooms.map((room) => (
                <div key={room} className="relative flex-shrink-0">
                  <button
                    onClick={() => setCurrentRoom(room)}
                    className={`pl-3 pr-8 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                      room === currentRoom ? 'bg-blue-900 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {room} ({roomItems(room).length})
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveRoom(room) }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 text-base leading-none transition ${
                      room === currentRoom ? 'text-blue-300 hover:text-white' : 'text-gray-300 hover:text-red-500'
                    }`}
                    title={`Remove ${room}`}
                  >×</button>
                </div>
              ))}
              <button
                data-add-room
                onClick={() => setShowAddRoom((v) => !v)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border-2 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50 whitespace-nowrap"
              >
                + Add Room
              </button>
            </div>

            {/* Add room dropdown */}
            {showAddRoom && (
              <div data-add-room className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-72">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select a room</p>
                <div className="space-y-0.5 mb-3 max-h-44 overflow-y-auto">
                  {TA10_ROOMS.filter((r) => !selectedRooms.includes(r)).map((room) => (
                    <button
                      key={room}
                      onClick={() => handleAddRoom(room)}
                      className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-900"
                    >
                      {room}
                    </button>
                  ))}
                  {TA10_ROOMS.every((r) => selectedRooms.includes(r)) && (
                    <p className="text-xs text-gray-400 italic px-3 py-1">All standard rooms added</p>
                  )}
                </div>
                <div className="flex gap-2 border-t pt-2">
                  <input
                    placeholder="Custom room name…"
                    value={customRoom}
                    onChange={(e) => setCustomRoom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddRoom(customRoom) }}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleAddRoom(customRoom)}
                    disabled={!customRoom.trim()}
                    className="bg-blue-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{currentRoom}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Exit
              </button>
              <button
                onClick={() => window.open(`/seller/${txId}/print`, '_blank')}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Print / PDF
              </button>
              <button
                onClick={() => openAddModal(currentRoom)}
                className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800"
              >
                + Add Item
              </button>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            {roomItems(currentRoom).map((item, idx) => {
              const globalIdx = items.findIndex((i) => i === item)
              return (
                <div key={idx} className="bg-white rounded-xl border p-4 shadow-sm">
                  {/* Item name */}
                  <div className="mb-3">
                    <input
                      placeholder="Item name (e.g. Integrated dishwasher)"
                      value={item.itemName}
                      onChange={(e) => updateItem(globalIdx, { itemName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Photos — prominent, above dropdowns */}
                  <div className="mb-3 border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50">
                    <p className="text-xs font-medium text-gray-500 mb-2">Photos</p>
                    {item.signedPhotoUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {item.signedPhotoUrls.map((url, pi) => (
                          <div key={pi} className="relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Photo ${pi + 1}`}
                              className="w-28 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 shadow-sm"
                              onClick={() => window.open(url, '_blank')}
                            />
                            <button
                              type="button"
                              disabled={deletingPhoto === item.photoUrls[pi]}
                              onClick={() => deletePhoto(globalIdx, pi)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition"
                              title="Remove photo"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic mb-2">No photos yet</p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <label className={`cursor-pointer inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition ${
                        uploadingIdx === globalIdx ? 'opacity-50 pointer-events-none bg-gray-100' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                      }`}>
                        {uploadingIdx === globalIdx ? '⏳ Uploading…' : '📁 Add from files'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(globalIdx, e)}
                          disabled={uploadingIdx !== null}
                        />
                      </label>
                      <label className={`cursor-pointer inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition ${
                        uploadingIdx === globalIdx ? 'opacity-50 pointer-events-none' : 'border-blue-300 text-blue-700 bg-white hover:bg-blue-50'
                      }`}>
                        📷 Use camera
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(globalIdx, e)}
                          disabled={uploadingIdx !== null}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Status / Value / Notes */}
                  <div className="grid gap-3">
                    <select
                      value={item.itemType}
                      onChange={(e) => updateItem(globalIdx, { itemType: e.target.value as ItemType })}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={item.status}
                        onChange={(e) => updateItem(globalIdx, { status: e.target.value as ItemStatus })}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="INCLUDED">Included in sale</option>
                        <option value="EXCLUDED">Excluded from sale</option>
                        <option value="NEGOTIABLE">Negotiable</option>
                        <option value="REMOVED_PRIOR">Removed prior to sale</option>
                        <option value="FOR_SALE">For sale separately</option>
                      </select>
                      {item.status === 'FOR_SALE' ? (
                        <input
                          type="number"
                          placeholder="Sale price (£)"
                          value={item.salePrice ?? ''}
                          onChange={(e) => updateItem(globalIdx, { salePrice: Number(e.target.value) || undefined })}
                          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <input
                          type="number"
                          placeholder="Estimated value (£)"
                          value={item.estimatedValue ?? ''}
                          onChange={(e) => updateItem(globalIdx, { estimatedValue: Number(e.target.value) || undefined })}
                          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>

                    <textarea
                      placeholder="Description (optional)"
                      value={item.notes ?? ''}
                      rows={2}
                      onChange={(e) => updateItem(globalIdx, { notes: e.target.value })}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />

                    <button
                      type="button"
                      onClick={() => { if (confirm('Remove this item?')) deleteItem(globalIdx) }}
                      className="w-full border border-red-200 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 hover:border-red-300 transition"
                    >
                      Remove Item
                    </button>
                  </div>
                </div>
              )
            })}
            {roomItems(currentRoom).length === 0 && (
              <p className="text-gray-400 text-sm italic text-center py-8">
                No items yet — use the button below to start
              </p>
            )}
            {/* Add Item button at bottom of list */}
            <button
              onClick={() => openAddModal(currentRoom)}
              className="w-full border-2 border-dashed border-blue-200 text-blue-700 py-4 rounded-xl text-sm font-semibold hover:border-blue-400 hover:bg-blue-50 transition"
            >
              + Add Item to {currentRoom}
            </button>
          </div>

          <div className="flex gap-3">
            {roomIdx > 0 && (
              <button
                onClick={() => setCurrentRoom(selectedRooms[roomIdx - 1])}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50"
              >
                ← Previous Room
              </button>
            )}
            {roomIdx < selectedRooms.length - 1 ? (
              <button
                onClick={() => setCurrentRoom(selectedRooms[roomIdx + 1])}
                className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800"
              >
                Next Room →
              </button>
            ) : (
              <button
                onClick={() => setScreen('review')}
                className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800"
              >
                Review Summary →
              </button>
            )}
          </div>
        </div>

        {/* Add Item Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
            <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
                <h2 className="text-base font-bold text-gray-900">Add New Item</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                >×</button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 p-5 space-y-4">

                {/* Room */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Area / Room <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={modal.room}
                    onChange={(e) => setModal((m) => ({ ...m, room: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— Select room —</option>
                    {TA10_ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                {/* Item Name */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Item Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    placeholder="e.g. Integrated dishwasher, Fitted wardrobe"
                    value={modal.name}
                    onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Item Type */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Item Type</label>
                  <select
                    value={modal.itemType}
                    onChange={(e) => setModal((m) => ({ ...m, itemType: e.target.value as ItemType }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Description</label>
                  <textarea
                    placeholder="Condition, usability or additional details (optional)"
                    value={modal.notes}
                    rows={2}
                    onChange={(e) => setModal((m) => ({ ...m, notes: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Included / Excluded</label>
                  <select
                    value={modal.status}
                    onChange={(e) => setModal((m) => ({ ...m, status: e.target.value as ItemStatus }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="INCLUDED">Included in sale</option>
                    <option value="EXCLUDED">Excluded from sale</option>
                    <option value="NEGOTIABLE">Negotiable</option>
                    <option value="REMOVED_PRIOR">Removed prior to sale</option>
                    <option value="FOR_SALE">For sale separately</option>
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Category</label>
                  <select
                    value={modal.category}
                    onChange={(e) => setModal((m) => ({ ...m, category: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— Select category (optional) —</option>
                    {TA10_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Price */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    {modal.status === 'FOR_SALE' ? 'Sale Price (£)' : 'Estimated Value (£)'}
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    value={modal.estimatedValue}
                    onChange={(e) => setModal((m) => ({ ...m, estimatedValue: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Photos */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Photo</label>
                  {modalPreviews.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {modalPreviews.map((url, i) => (
                        <div key={i} className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Preview ${i + 1}`} className="w-24 h-16 object-cover rounded-lg border border-gray-200 shadow-sm" />
                          <button
                            type="button"
                            onClick={() => removeModalFile(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <label className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                      📁 Add Files
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleModalFileSelect} />
                    </label>
                    <label className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition">
                      📷 Camera
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleModalFileSelect} />
                    </label>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="border-t px-5 py-4 flex-shrink-0 bg-white">
                {modalError && (
                  <p className="text-red-600 text-sm mb-3">{modalError}</p>
                )}
                <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!modal.room || !modal.name.trim() || savingModal}
                  onClick={handleAddFromModal}
                  className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition"
                >
                  {savingModal ? 'Adding…' : 'Add Item'}
                </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    )
  }

  if (screen === 'review') {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Review Your Form</h1>
              <p className="text-gray-500 text-sm">{items.length} item(s) across {selectedRooms.length} room(s)</p>
            </div>
            <button
              onClick={() => window.open(`/seller/${txId}/print`, '_blank')}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Print / Save as PDF
            </button>
          </div>

          <div className="mb-6 mt-6">
            {selectedRooms.map((room) => (
              <div key={room} className="mb-5">
                <h2 className="font-semibold text-gray-800 mb-2">{room}</h2>
                {roomItems(room).length === 0 ? (
                  <p className="text-gray-400 text-sm italic">No items</p>
                ) : (
                  <div className="space-y-2">
                    {roomItems(room).map((item, i) => (
                      <div key={i} className="bg-white border rounded-xl p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{item.itemName || item.description || <span className="text-red-400 italic">Missing item name</span>}</p>
                            {item.description && item.itemName && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                            {item.category && <p className="text-xs text-gray-400">{item.category}</p>}
                            {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.status === 'INCLUDED' ? 'bg-green-50 text-green-700' :
                              item.status === 'EXCLUDED' ? 'bg-red-50 text-red-700' :
                              item.status === 'FOR_SALE' ? 'bg-purple-50 text-purple-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>{item.status}</span>
                            {item.status === 'FOR_SALE' && item.salePrice && (
                              <span className="text-xs text-gray-500">Sale price: £{item.salePrice}</span>
                            )}
                            {item.estimatedValue && <span className="text-xs text-gray-500">£{item.estimatedValue}</span>}
                          </div>
                        </div>
                        {item.signedPhotoUrls.length > 0 && (
                          <div className="flex gap-2 mt-3 flex-wrap">
                            {item.signedPhotoUrls.map((url, pi) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={pi} src={url} alt={`Photo ${pi + 1}`}
                                className="w-28 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 shadow-sm"
                                onClick={() => window.open(url, '_blank')}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Exit
            </button>
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
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Exit
            </button>
            <button onClick={() => setScreen('review')} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg">
              Back
            </button>
            <button
              disabled={!legalAgreed || submitting}
              onClick={handleSubmit}
              className="flex-1 bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Complete & Submit Form'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-xl shadow p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Form Complete</h1>
        <p className="text-gray-600 mb-6">
          Your Fixtures &amp; Fittings form has been submitted. A copy has been sent to your estate agent and solicitor.
        </p>
        <button
          onClick={() => window.open(`/seller/${txId}/print`, '_blank')}
          className="text-sm text-blue-600 hover:underline"
        >
          Print / save a copy of your submission
        </button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className="mt-4 w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          Exit
        </button>
      </div>
    </main>
  )
}
