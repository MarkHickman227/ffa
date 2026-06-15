'use client'
import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  purple: '#370994', purpleLight: '#EEEDFE', purpleMid: '#534AB7',
  teal: '#1D9E75', tealLight: '#E1F5EE', tealDark: '#085041',
  amberLight: '#FAEEDA', amberDark: '#633806',
  redLight: '#FCEBEB', redDark: '#791F1F',
  border: '#e5e5e5', text: '#1a1a1a', textMuted: '#6b7280', textHint: '#9ca3af',
  bg: '#fff', bgSurface: '#f9f9f8',
} as const

const ROOMS = [
  { id: 'kitchen',   name: 'Kitchen',                icon: '🍳' },
  { id: 'bathroom',  name: 'Bathroom',               icon: '🛁' },
  { id: 'lounge',    name: 'Lounge / Living room',   icon: '🛋️' },
  { id: 'master',    name: 'Master bedroom',          icon: '🛏️' },
  { id: 'bedroom2',  name: 'Bedroom 2',               icon: '🛏️' },
  { id: 'bedroom3',  name: 'Bedroom 3',               icon: '🛏️' },
  { id: 'hallway',   name: 'Hallway',                 icon: '🚪' },
  { id: 'garden',    name: 'Garden',                  icon: '🌿' },
  { id: 'garage',    name: 'Garage / Outbuildings',   icon: '🏠' },
  { id: 'utility',   name: 'Utility room',            icon: '🔧' },
  { id: 'loft',      name: 'Loft / Roof space',       icon: '📦' },
  { id: 'external',  name: 'External / Security',     icon: '🔒' },
]

type Status = 'include' | 'exclude' | 'negotiate'
type Sdlt   = 'low' | 'medium' | 'high'
type Screen = 'home' | 'room' | 'review' | 'submitting' | 'done'
type Mode   = 'photo' | 'analyzing' | 'form'

interface Item {
  id: string
  title: string
  brand: string
  price: number | null
  sdlt: Sdlt
  notes: string
  status: Status
  imgData: string | null
  reasoning?: string
}

type RoomMap = Record<string, Item[]>

const initRooms = (): RoomMap => Object.fromEntries(ROOMS.map(r => [r.id, []]))
const blankItem = (): Item => ({ id: crypto.randomUUID(), title: '', brand: '', price: null, sdlt: 'low', notes: '', status: 'include', imgData: null })

const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string }> = {
  include:   { bg: '#E1F5EE', color: '#085041', border: '#1D9E75' },
  exclude:   { bg: '#FCEBEB', color: '#791F1F', border: '#F09595' },
  negotiate: { bg: '#FAEEDA', color: '#633806', border: '#EF9F27' },
}

export default function SellerFormPage() {
  const params = useParams()
  const txId = params?.txId as string
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [propRef,    setPropRef]    = useState('')
  const [screen,     setScreen]     = useState<Screen>('home')
  const [curRoom,    setCurRoom]    = useState('kitchen')
  const [roomItems,  setRoomItems]  = useState<RoomMap>(initRooms)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [modalMode,  setModalMode]  = useState<Mode>('photo')
  const [editItem,   setEditItem]   = useState<Item>(blankItem())
  const [editIdx,    setEditIdx]    = useState<number | null>(null)
  const [subId,        setSubId]        = useState('')
  const [submitErr,    setSubmitErr]    = useState('')
  const [showExitDlg,  setShowExitDlg]  = useState(false)
  const [saveStatus,   setSaveStatus]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedItems,   setSavedItems]   = useState<Array<{ id: string; room: string; itemName: string; make: string | null; estimatedValue: string | null; photoUrls: string[] }>>([])
  const [deletingId,   setDeletingId]   = useState<string | null>(null)

  const camRef  = useRef<HTMLInputElement>(null)
  const gallRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/transactions/${txId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { property?: { addressLine1?: string; postcode?: string } } | null) => {
        if (d?.property) {
          const { addressLine1, postcode } = d.property
          setPropRef([addressLine1, postcode].filter(Boolean).join(', '))
        }
      })
      .catch(() => {})
  }, [txId])

  useEffect(() => {
    if (screen !== 'home') return
    fetch(`/api/transactions/${txId}/fixtures`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Record<string, unknown>[]) => setSavedItems(
        data.filter(i => ((i.sortOrder as number) ?? 0) >= 0).map(i => ({
          id:             String(i.id ?? ''),
          room:           String(i.room ?? ''),
          itemName:       String(i.itemName ?? ''),
          make:           i.make ? String(i.make) : null,
          estimatedValue: i.estimatedValue != null ? String(i.estimatedValue) : null,
          photoUrls:      Array.isArray(i.signedPhotoUrls) ? (i.signedPhotoUrls as string[]) : [],
        }))
      ))
      .catch(() => {})
  }, [txId, screen])

  if (authStatus === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f4f3f0' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #EEEDFE', borderTopColor: '#370994', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (authStatus === 'unauthenticated') { router.push('/auth/signin'); return null }

  const totalItems     = Object.values(roomItems).reduce((n, a) => n + a.length, 0)
  const roomsWithItems = Object.values(roomItems).filter(a => a.length > 0).length

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openAddItem() {
    setEditItem(blankItem())
    setEditIdx(null)
    setModalMode('photo')
    setModalOpen(true)
  }

  function openEditItem(roomId: string, idx: number) {
    setCurRoom(roomId)
    setEditItem({ ...roomItems[roomId][idx] })
    setEditIdx(idx)
    setModalMode('form')
    setModalOpen(true)
  }

  function skipPhoto() {
    setEditItem(blankItem())
    setModalMode('form')
  }

  function resizeDataUrl(dataUrl: string, maxPx = 1000): Promise<string> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
  }

  async function handlePhoto(file: File) {
    let dataUrl: string | null = null
    try {
      const raw = await new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = e => res(e.target!.result as string)
        fr.onerror = () => rej(new Error('FileReader failed'))
        fr.readAsDataURL(file)
      })
      dataUrl = await resizeDataUrl(raw)
    } catch (err) {
      console.error('[handlePhoto] image read error:', err)
      return
    }

    setModalMode('analyzing')
    try {
      const r = await fetch(`/api/transactions/${txId}/ffa/item-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoDataUrl: dataUrl, ta10Category: curRoom }),
      })
      if (!r.ok) {
        const errText = await r.text().catch(() => r.status.toString())
        throw new Error(`lookup ${r.status}: ${errText}`)
      }
      const d = await r.json() as Record<string, unknown>
      const sdlt = typeof d.sdlt_sensitivity === 'string'
        ? (d.sdlt_sensitivity.toLowerCase() as Sdlt)
        : 'low'
      const st: Status = d.suggested_status === 'Exclude' ? 'exclude' : d.suggested_status === 'Negotiate' ? 'negotiate' : 'include'
      setEditItem({
        id: crypto.randomUUID(),
        title:     String(d.item_name ?? ''),
        brand:     [d.brand, d.model].filter(Boolean).join(' '),
        price:     typeof d.estimated_value === 'number' ? d.estimated_value : null,
        sdlt,
        notes:     '',
        status:    st,
        imgData:   dataUrl,
        reasoning: typeof d.reasoning === 'string' ? d.reasoning : undefined,
      })
    } catch (err) {
      console.error('[handlePhoto] API error:', err)
      setEditItem({ ...blankItem(), imgData: dataUrl })
    }
    setModalMode('form')
  }

  function saveItem() {
    if (!editItem.title.trim()) return
    setRoomItems(prev => {
      const arr = [...prev[curRoom]]
      editIdx !== null ? (arr[editIdx] = editItem) : arr.push(editItem)
      return { ...prev, [curRoom]: arr }
    })
    setModalOpen(false)
  }

  function deleteItem() {
    setRoomItems(prev => ({
      ...prev,
      [curRoom]: prev[curRoom].filter((_, i) => i !== editIdx),
    }))
    setModalOpen(false)
  }

  async function handleSubmit() {
    setSubmitErr('')
    setScreen('submitting')
    const items = ROOMS.flatMap(r =>
      roomItems[r.id].map(item => ({
        item_name:         item.title,
        brand:             item.brand,
        model:             '',
        estimated_value:   item.price,
        sdlt_sensitivity:  item.sdlt === 'high' ? 'High' : item.sdlt === 'medium' ? 'Medium' : 'Low',
        notes:             item.notes,
        status:            item.status === 'include' ? 'Include' : item.status === 'exclude' ? 'Exclude' : 'Negotiate',
        room:              r.name,
        ...(item.imgData ? { image: item.imgData.split(',')[1] } : {}),
      }))
    )
    try {
      const r = await fetch(`/api/transactions/${txId}/ffa/direct-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_reference: propRef, items }),
      })
      const d = await r.json() as { submission_id?: string; error?: string }
      if (d.submission_id) {
        setSubId(d.submission_id)
        setScreen('done')
      } else {
        setSubmitErr(d.error || 'Submission failed')
        setScreen('review')
      }
    } catch {
      setSubmitErr('Network error — please try again')
      setScreen('review')
    }
  }

  function buildPayload() {
    return ROOMS.flatMap(r =>
      roomItems[r.id].map(item => ({
        room:    r.name,
        title:   item.title,
        brand:   item.brand,
        price:   item.price,
        sdlt:    item.sdlt,
        notes:   item.notes,
        status:  item.status,
        imgData: item.imgData,
      }))
    )
  }

  async function handleSave() {
    if (saveStatus === 'saving') return
    setSaveStatus('saving')
    try {
      const r = await fetch(`/api/transactions/${txId}/ffa/save-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: buildPayload() }),
      })
      if (!r.ok) throw new Error('save failed')
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  async function deleteSavedItem(id: string) {
    setDeletingId(id)
    try {
      const r = await fetch(`/api/transactions/${txId}/fixtures/${id}`, { method: 'DELETE' })
      if (r.ok || r.status === 204) setSavedItems(prev => prev.filter(i => i.id !== id))
    } catch { /* ignore */ } finally {
      setDeletingId(null)
    }
  }

  async function handleReviewAndSubmit() {
    setSubmitErr('')
    setScreen('submitting')
    try {
      const r = await fetch(`/api/transactions/${txId}/ffa/seller-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_reference: propRef, items: buildPayload() }),
      })
      const d = await r.json() as { submitted?: boolean; error?: string }
      if (d.submitted) {
        setScreen('done')
      } else {
        setSubmitErr(d.error || 'Submission failed')
        setScreen('review')
      }
    } catch {
      setSubmitErr('Network error — please try again')
      setScreen('review')
    }
  }

  // ── Shared styles ────────────────────────────────────────────────────────────

  const fieldLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, color: C.textMuted, marginBottom: 3, marginTop: 10,
    display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em',
  }
  const fieldInput: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: `0.5px solid ${C.border}`,
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: C.bg,
    color: C.text, boxSizing: 'border-box',
  }
  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: 15, background: C.purple, color: '#fff', border: 'none',
    borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4,
  }
  const btnSecondary: React.CSSProperties = {
    width: '100%', padding: 13, border: `0.5px solid ${C.border}`, borderRadius: 12,
    background: C.bg, fontSize: 14, fontWeight: 500, color: C.textMuted, cursor: 'pointer', marginTop: 8,
  }

  const headerSub =
    screen === 'home'   ? (propRef || 'TA10 Digital Form') :
    screen === 'room'   ? (ROOMS.find(r => r.id === curRoom)?.name ?? '') :
    screen === 'review' ? 'Review all items' : ''

  const _ = subId // suppress unused warning

  return (
    <>
      <style>{`
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
      `}</style>
      <div style={{ background: '#f4f3f0', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>
        <div style={{ maxWidth: 500, margin: '0 auto', background: C.bg, minHeight: '100vh', paddingBottom: 40 }}>

          {/* ── Header ── */}
          <div style={{ padding: '14px 16px 12px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: C.bg, zIndex: 100 }}>
            {screen !== 'home' && screen !== 'submitting' && screen !== 'done' && (
              <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textMuted, padding: 4, lineHeight: 1 }}>←</button>
            )}
            <div style={{ width: 30, height: 30, background: C.purple, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>FFA</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Fixtures &amp; Fittings</p>
              <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>{headerSub}</p>
            </div>
            {screen !== 'submitting' && screen !== 'done' && (
              <button onClick={() => setShowExitDlg(true)}
                style={{ padding: '5px 12px', border: `0.5px solid ${C.border}`, borderRadius: 20, background: C.bg, fontSize: 12, color: C.textMuted, cursor: 'pointer', flexShrink: 0 }}>
                Exit
              </button>
            )}
          </div>

          {/* ── HOME ── */}
          {screen === 'home' && (
            <div style={{ padding: 16 }}>
              <input
                style={{ width: '100%', padding: '11px 14px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }}
                type="text" placeholder="Property address (optional)"
                value={propRef} onChange={e => setPropRef(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
                <span>{totalItems} item{totalItems !== 1 ? 's' : ''} recorded</span>
                <span style={{ color: C.purple, fontWeight: 500 }}>{roomsWithItems} of 12 rooms</span>
              </div>
              <div style={{ height: 4, background: '#e5e5e5', borderRadius: 2, marginBottom: 16 }}>
                <div style={{ height: '100%', background: C.purple, borderRadius: 2, width: `${Math.round(roomsWithItems / 12 * 100)}%`, transition: 'width .3s' }} />
              </div>
              {ROOMS.map(room => {
                const rItems = roomItems[room.id]
                return (
                  <div key={room.id} onClick={() => { setCurRoom(room.id); setScreen('room') }}
                    style={{ background: C.bg, border: `0.5px solid ${rItems.length > 0 ? C.teal : C.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                      <span style={{ fontSize: 22 }}>{room.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{room.name}</span>
                      <span style={{ fontSize: 12, color: C.textMuted }}>{rItems.length} item{rItems.length !== 1 ? 's' : ''}</span>
                      <span style={{ fontSize: 16, color: C.textHint }}>›</span>
                    </div>
                    {rItems.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 3, padding: '0 3px 3px' }}>
                        {Array.from({ length: 4 }, (_, i) => {
                          const it = rItems[i]
                          if (it?.imgData) return <div key={i} style={{ aspectRatio: '1', borderRadius: 4, overflow: 'hidden' }}><img src={it.imgData} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                          if (it) return <div key={i} style={{ aspectRatio: '1', borderRadius: 4, background: C.purpleLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.purpleMid, fontWeight: 500 }}>{it.title.slice(0, 6)}</div>
                          return <div key={i} style={{ aspectRatio: '1', borderRadius: 4, border: `0.5px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.textHint, background: C.bgSurface }}>+</div>
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <button style={btnPrimary} onClick={() => setScreen('review')}>Review &amp; Submit →</button>
              <button style={btnSecondary} onClick={handleSave} disabled={saveStatus === 'saving'}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Save failed — tap to retry' : 'Save'}
              </button>
              {savedItems.length > 0 && (
                <div style={{ marginTop: 24, borderTop: `0.5px solid ${C.border}`, paddingTop: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                    Previously submitted ({savedItems.length})
                  </p>
                  {savedItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `0.5px solid ${C.border}`, borderRadius: 8, marginBottom: 6, background: C.bg }}>
                      {item.photoUrls[0]
                        ? <img src={item.photoUrls[0]} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: `0.5px solid ${C.border}` }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 6, flexShrink: 0, background: C.bgSurface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.itemName}</p>
                        <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0' }}>
                          {item.room}{item.make ? ` · ${item.make}` : ''}{item.estimatedValue ? ` · £${item.estimatedValue}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteSavedItem(item.id)}
                        disabled={deletingId === item.id}
                        style={{ padding: '5px 10px', border: `0.5px solid #F09595`, borderRadius: 6, background: 'transparent', color: C.redDark, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                        {deletingId === item.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ROOM ── */}
          {screen === 'room' && (
            <>
              <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textMuted, padding: 4, lineHeight: 1 }}>←</button>
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{ROOMS.find(r => r.id === curRoom)?.name}</span>
                <button onClick={openAddItem} style={{ background: C.purple, color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Add item</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, padding: 14 }}>
                {roomItems[curRoom].map((item, idx) => (
                  <div key={item.id} onClick={() => openEditItem(curRoom, idx)} style={{ borderRadius: 8, border: `0.5px solid ${C.border}`, overflow: 'hidden', cursor: 'pointer', background: C.bg }}>
                    {item.imgData
                      ? <img src={item.imgData} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', aspectRatio: '4/3', background: C.bgSurface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{ROOMS.find(r => r.id === curRoom)?.icon}</div>
                    }
                    <div style={{ padding: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                      <p style={{ fontSize: 11, margin: '2px 0 0' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 4, background: item.status === 'include' ? C.teal : item.status === 'exclude' ? '#F09595' : '#EF9F27' }} />
                        <span style={{ color: C.textMuted, textTransform: 'capitalize' }}>{item.status}</span>
                      </p>
                    </div>
                  </div>
                ))}
                <div onClick={openAddItem} style={{ borderRadius: 8, border: `1.5px dashed ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 140, gap: 6, cursor: 'pointer' }}>
                  <span style={{ fontSize: 24, color: C.textHint }}>+</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>Add item</span>
                </div>
              </div>
            </>
          )}

          {/* ── REVIEW ── */}
          {screen === 'review' && (
            <>
              <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textMuted, padding: 4, lineHeight: 1 }}>←</button>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Review all items</span>
              </div>
              <div style={{ padding: 16 }}>
                {submitErr && <div style={{ background: C.redLight, color: C.redDark, padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{submitErr}</div>}
                {ROOMS.filter(r => roomItems[r.id].length > 0).map(room => (
                  <div key={room.id} style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{room.icon}</span>{room.name}
                    </p>
                    {roomItems[room.id].map((item, idx) => {
                      const sc = STATUS_STYLE[item.status]
                      return (
                        <div key={item.id} onClick={() => openEditItem(room.id, idx)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: `0.5px solid ${C.border}`, borderRadius: 8, marginBottom: 6, background: C.bg, cursor: 'pointer' }}>
                          {item.imgData
                            ? <img src={item.imgData} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: `0.5px solid ${C.border}` }} />
                            : <div style={{ width: 48, height: 48, borderRadius: 6, flexShrink: 0, background: C.bgSurface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{room.icon}</div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                            <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0' }}>{item.brand || 'No brand'}{item.price ? ` · £${item.price}` : ''}</p>
                          </div>
                          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 500, textTransform: 'capitalize', flexShrink: 0, background: sc.bg, color: sc.color, border: `0.5px solid ${sc.border}` }}>{item.status}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
                {totalItems === 0 && <p style={{ color: C.textMuted, fontSize: 14, textAlign: 'center', padding: '32px 0' }}>No items added yet — go back and add items to rooms.</p>}
                <button style={{ ...btnPrimary, opacity: totalItems === 0 ? 0.4 : 1 }} disabled={totalItems === 0} onClick={handleReviewAndSubmit}>Review and Submit</button>
                <button style={btnSecondary} onClick={() => setScreen('home')}>← Back to rooms</button>
              </div>
            </>
          )}

          {/* ── SUBMITTING ── */}
          {screen === 'submitting' && (
            <div style={{ textAlign: 'center', padding: '80px 16px' }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${C.purpleLight}`, borderTopColor: C.purple, borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontSize: 14, color: C.textMuted }}>Submitting form...</p>
            </div>
          )}

          {/* ── DONE ── */}
          {screen === 'done' && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
              <p style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Form submitted</p>
              <p style={{ fontSize: 14, color: C.textMuted }}>{totalItems} items across {roomsWithItems} room{roomsWithItems !== 1 ? 's' : ''}</p>
              <div style={{ background: C.purpleLight, borderRadius: 8, padding: 14, margin: '16px 0', textAlign: 'left' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: C.purpleMid, marginBottom: 4, textTransform: 'uppercase' }}>Buyer review link</p>
                <p style={{ fontSize: 12, color: C.purpleMid, wordBreak: 'break-all', lineHeight: 1.5, margin: 0 }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/buyer/${txId}` : ''}
                </p>
              </div>
              <button style={btnPrimary} onClick={() => navigator.clipboard.writeText(`${window.location.origin}/buyer/${txId}`).catch(() => {})}>Copy buyer link</button>
              <button style={btnSecondary} onClick={() => { setRoomItems(initRooms()); setScreen('home') }}>Start new form</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Exit Confirmation ── */}
      {showExitDlg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.bg, borderRadius: 12, padding: 24, maxWidth: 340, width: '100%' }}>
            <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Save before exiting?</p>
            <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 20px', lineHeight: 1.5 }}>Your items will be lost if you exit without saving.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={async () => { setShowExitDlg(false); await handleSave(); signOut({ callbackUrl: '/auth/signin' }) }}
                style={{ flex: 1, padding: 13, background: C.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Yes, save
              </button>
              <button onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                style={{ flex: 1, padding: 13, border: `0.5px solid ${C.border}`, borderRadius: 8, background: C.bg, fontSize: 14, color: C.textMuted, cursor: 'pointer' }}>
                No, exit
              </button>
            </div>
            <button onClick={() => setShowExitDlg(false)}
              style={{ width: '100%', marginTop: 8, padding: 10, border: 'none', background: 'none', fontSize: 13, color: C.textHint, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Item Modal ── */}
      {modalOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.bg, borderRadius: '12px 12px 0 0', width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto', paddingBottom: 24 }}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: '10px auto 6px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 12px' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{editIdx !== null ? 'Edit item' : 'Add item'}</span>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.textMuted, padding: 4 }}>✕</button>
            </div>
            <div style={{ padding: '0 16px' }}>

              {/* Photo zone */}
              {modalMode === 'photo' && (
                <div>
                  <input type="file" ref={camRef}  accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handlePhoto(f) }} />
                  <input type="file" ref={gallRef} accept="image/*"                       style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handlePhoto(f) }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
                    <button onClick={() => camRef.current?.click()}  style={{ padding: '20px 8px', border: `1.5px dashed ${C.border}`, borderRadius: 8, background: C.bgSurface, cursor: 'pointer', fontSize: 13, color: C.textMuted }}>📷 Camera</button>
                    <button onClick={() => gallRef.current?.click()} style={{ padding: '20px 8px', border: `1.5px dashed ${C.border}`, borderRadius: 8, background: C.bgSurface, cursor: 'pointer', fontSize: 13, color: C.textMuted }}>🖼️ Gallery</button>
                  </div>
                  <button onClick={skipPhoto} style={{ width: '100%', padding: 10, border: 'none', background: 'none', fontSize: 13, color: C.purpleMid, cursor: 'pointer' }}>Skip photo — enter details manually</button>
                </div>
              )}

              {/* Analyzing */}
              {modalMode === 'analyzing' && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ width: 32, height: 32, border: `3px solid ${C.purpleLight}`, borderTopColor: C.purple, borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13, color: C.textMuted }}>Identifying item...</p>
                </div>
              )}

              {/* Form fields */}
              {modalMode === 'form' && (
                <>
                  {editItem.imgData && <img src={editItem.imgData} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover', marginBottom: 12, border: `0.5px solid ${C.border}` }} />}
                  {editItem.imgData && (
                    <button onClick={() => { setEditItem(i => ({ ...i, imgData: null })); setModalMode('photo') }}
                      style={{ width: '100%', padding: 11, border: `0.5px solid ${C.border}`, borderRadius: 8, background: C.bg, fontSize: 13, color: C.textMuted, cursor: 'pointer', marginBottom: 4 }}>↺ Retake photo</button>
                  )}
                  <label style={fieldLabel}>Item name *</label>
                  <input style={fieldInput} type="text" placeholder="e.g. Integrated dishwasher" value={editItem.title} onChange={e => setEditItem(i => ({ ...i, title: e.target.value }))} />
                  <label style={fieldLabel}>Brand / model</label>
                  <input style={fieldInput} type="text" placeholder="e.g. Bosch Series 6" value={editItem.brand} onChange={e => setEditItem(i => ({ ...i, brand: e.target.value }))} />
                  <label style={fieldLabel}>Est. value (£)</label>
                  <input style={fieldInput} type="number" placeholder="e.g. 450" value={editItem.price ?? ''} onChange={e => setEditItem(i => ({ ...i, price: e.target.value ? Number(e.target.value) : null }))} />
                  <label style={fieldLabel}>SDLT sensitivity</label>
                  <select style={fieldInput} value={editItem.sdlt} onChange={e => setEditItem(i => ({ ...i, sdlt: e.target.value as Sdlt }))}>
                    <option value="high">High — permanently fixed</option>
                    <option value="medium">Medium — semi-permanent</option>
                    <option value="low">Low — freestanding</option>
                  </select>
                  <label style={fieldLabel}>Notes</label>
                  <input style={fieldInput} type="text" placeholder="Any additional details" value={editItem.notes} onChange={e => setEditItem(i => ({ ...i, notes: e.target.value }))} />
                  <label style={fieldLabel}>Include in sale?</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                    {(['include', 'exclude', 'negotiate'] as Status[]).map(st => {
                      const sc = STATUS_STYLE[st]
                      const active = editItem.status === st
                      return (
                        <button key={st} onClick={() => setEditItem(i => ({ ...i, status: st }))}
                          style={{ flex: 1, padding: '9px 4px', border: `0.5px solid ${active ? sc.border : C.border}`, borderRadius: 20, background: active ? sc.bg : C.bg, fontSize: 12, fontWeight: 500, color: active ? sc.color : C.textMuted, cursor: 'pointer', textAlign: 'center' }}>
                          {st === 'include' ? '✓ Include' : st === 'exclude' ? '✕ Exclude' : '⇄ Negotiate'}
                        </button>
                      )
                    })}
                  </div>
                  {editItem.reasoning && <p style={{ fontSize: 11, color: C.textHint, marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>{editItem.reasoning}</p>}
                </>
              )}
            </div>
            {modalMode === 'form' && (
              <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0' }}>
                {editIdx !== null && <button onClick={deleteItem} style={{ flex: 1, padding: 13, border: '0.5px solid #F09595', borderRadius: 8, background: C.bg, fontSize: 13, color: C.redDark, cursor: 'pointer' }}>🗑 Delete</button>}
                <button onClick={saveItem} disabled={!editItem.title.trim()}
                  style={{ flex: 2, padding: 13, background: editItem.title.trim() ? C.purple : '#ccc', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: editItem.title.trim() ? 'pointer' : 'default' }}>Save item</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
