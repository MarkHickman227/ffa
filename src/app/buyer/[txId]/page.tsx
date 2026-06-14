'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import type { FfaFormDetail, BuyerResponseType } from '@/lib/ffa-api'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  purple: '#370994', purpleLight: '#EEEDFE', purpleMid: '#534AB7',
  teal: '#1D9E75', tealLight: '#E1F5EE', tealDark: '#085041',
  amberLight: '#FAEEDA', amberDark: '#633806',
  redLight: '#FCEBEB', redDark: '#791F1F',
  border: '#e5e5e5', text: '#1a1a1a', textMuted: '#6b7280', textHint: '#9ca3af',
  bg: '#fff', bgSurface: '#f9f9f8',
} as const

interface Decision {
  type: BuyerResponseType
  counterValue?: number
  notes?: string
}

const SDLT_STYLE = (s: string) =>
  s === 'High'   ? { bg: C.redLight,   color: C.redDark   } :
  s === 'Medium' ? { bg: C.amberLight, color: C.amberDark } :
                   { bg: C.tealLight,  color: C.tealDark  }

const STATUS_STYLE = (s: string) =>
  s === 'Exclude'   ? { bg: C.redLight,   color: C.redDark   } :
  s === 'Negotiate' ? { bg: C.amberLight, color: C.amberDark } :
                      { bg: C.tealLight,  color: C.tealDark  }

const DEC_BORDER: Record<BuyerResponseType, string> = {
  accept:  '#1D9E75',
  counter: '#EF9F27',
  reject:  '#F09595',
}

export default function BuyerReviewPage() {
  const params = useParams()
  const txId = params?.txId as string
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [loading,    setLoading]    = useState(true)
  const [loadErr,    setLoadErr]    = useState('')
  const [form,       setForm]       = useState<FfaFormDetail | null>(null)
  const [decisions,  setDecisions]  = useState<Record<string, Decision>>({})
  const [counter,    setCounter]    = useState<{ open: boolean; name: string; value: string; notes: string }>({ open: false, name: '', value: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitErr,  setSubmitErr]  = useState('')
  const [submitted,  setSubmitted]  = useState(false)

  useEffect(() => {
    // Try FFA API first; fall back to Prisma fixtures if no submission exists
    fetch(`/api/transactions/${txId}/ffa/form`)
      .then(r => r.json())
      .then(async (d: FfaFormDetail & { error?: string }) => {
        if (!d.error) { setForm(d); return }

        // Fallback: load from Prisma fixtures + transaction
        const [txRes, fixtRes] = await Promise.all([
          fetch(`/api/transactions/${txId}`),
          fetch(`/api/transactions/${txId}/fixtures`),
        ])
        const tx    = await txRes.json()
        const fixt  = await fixtRes.json()
        const items = (fixt.items ?? fixt ?? []).map((i: Record<string, unknown>) => ({
          item_name:        String(i.itemName ?? i.item_name ?? ''),
          brand:            String(i.make ?? i.brand ?? ''),
          model:            String(i.model ?? ''),
          estimated_value:  typeof i.estimatedValue === 'number' ? i.estimatedValue : typeof i.estimated_value === 'number' ? i.estimated_value : null,
          sdlt_sensitivity: 'Low' as const,
          notes:            String(i.notes ?? ''),
          status:           i.status === 'EXCLUDED' ? 'Exclude' : i.status === 'NEGOTIABLE' ? 'Negotiate' : 'Include',
          room:             String(i.room ?? 'General'),
          image:            Array.isArray(i.signedPhotoUrls) && (i.signedPhotoUrls as string[]).length > 0 ? (i.signedPhotoUrls as string[])[0] : undefined,
        }))
        const propRef = tx?.property
          ? [tx.property.addressLine1, tx.property.postcode].filter(Boolean).join(', ')
          : (tx?.reference ?? txId)
        setForm({ submission_id: '', property_reference: propRef, timestamp: '', items })
      })
      .catch((e: Error) => setLoadErr(e.message || 'Could not load form'))
      .finally(() => setLoading(false))
  }, [txId])

  if (authStatus === 'loading' || loading) return <Spinner label="Loading form..." />
  if (authStatus === 'unauthenticated') { router.push('/login'); return null }

  if (loadErr) {
    return (
      <Shell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: C.bg, borderRadius: 12, padding: 24, maxWidth: 400, width: '100%', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>⚠️</p>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Form not available</p>
            <p style={{ fontSize: 14, color: C.textMuted }}>
              {loadErr === 'No external submission on record'
                ? 'The seller has not yet submitted the fixtures form.'
                : loadErr}
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  if (!form) return null

  const rooms      = [...new Set(form.items.map(i => i.room))]
  const decided    = Object.keys(decisions).length
  const allDecided = decided >= form.items.length

  const accepted  = Object.values(decisions).filter(d => d.type === 'accept').length
  const rejected  = Object.values(decisions).filter(d => d.type === 'reject').length
  const countered = Object.values(decisions).filter(d => d.type === 'counter').length

  function decide(name: string, type: BuyerResponseType) {
    setDecisions(d => ({ ...d, [name]: { type } }))
  }

  function openCounter(name: string) {
    const ex = decisions[name]
    setCounter({ open: true, name, value: ex?.type === 'counter' && ex.counterValue != null ? String(ex.counterValue) : '', notes: ex?.notes || '' })
  }

  function confirmCounter() {
    setDecisions(d => ({
      ...d,
      [counter.name]: {
        type: 'counter',
        ...(counter.value ? { counterValue: Number(counter.value) } : {}),
        ...(counter.notes ? { notes: counter.notes } : {}),
      },
    }))
    setCounter(c => ({ ...c, open: false }))
  }

  async function submitResponses() {
    setSubmitting(true)
    setSubmitErr('')
    const responses = form!.items.map(item => {
      const d = decisions[item.item_name] ?? { type: 'accept' as BuyerResponseType }
      return {
        item_name: item.item_name,
        response:  d.type,
        ...(d.counterValue != null ? { counter_value: d.counterValue } : {}),
        ...(d.notes            ? { notes: d.notes }           : {}),
      }
    })
    try {
      const r = await fetch(`/api/transactions/${txId}/ffa/buyer-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses }),
      })
      const data = await r.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setSubmitted(true)
      } else {
        setSubmitErr(data.error || 'Submission failed')
      }
    } catch {
      setSubmitErr('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: C.textMuted, marginBottom: 3, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }
  const fieldInput: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }

  if (submitted) {
    return (
      <Shell property={form.property_reference}>
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Review submitted</p>
          <p style={{ fontSize: 14, color: C.textMuted, marginBottom: 20 }}>{form.items.length} items reviewed</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {accepted  > 0 && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: C.tealLight,  color: C.tealDark  }}>✓ {accepted} accepted</span>}
            {rejected  > 0 && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: C.redLight,   color: C.redDark   }}>✕ {rejected} rejected</span>}
            {countered > 0 && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: C.amberLight, color: C.amberDark }}>⇄ {countered} countered</span>}
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontFamily: "'Inter',sans-serif", background: '#f4f3f0', minHeight: '100vh' }}>
        <div style={{ maxWidth: 500, margin: '0 auto', background: C.bg, minHeight: '100vh', paddingBottom: 90 }}>

          {/* Header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: C.bg, zIndex: 100 }}>
            <div style={{ width: 30, height: 30, background: C.purple, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>FFA</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Buyer Review</p>
              <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>{form.property_reference}</p>
            </div>
            <span style={{ fontSize: 12, color: C.textMuted }}>{decided}/{form.items.length} reviewed</span>
          </div>

          {/* Items by room */}
          <div style={{ padding: 16 }}>
            {rooms.map(room => (
              <div key={room} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{room}</p>
                {form.items.filter(i => i.room === room).map(item => {
                  const dec  = decisions[item.item_name]
                  const sdlt = SDLT_STYLE(item.sdlt_sensitivity)
                  const stat = STATUS_STYLE(item.status)
                  return (
                    <div key={item.item_name} style={{ border: `0.5px solid ${dec ? DEC_BORDER[dec.type] : C.border}`, borderRadius: 10, marginBottom: 10, background: C.bg, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 10, padding: 12 }}>
                        {item.image
                          ? <img src={item.image} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 7, flexShrink: 0, border: `0.5px solid ${C.border}` }} />
                          : <div style={{ width: 56, height: 56, borderRadius: 7, flexShrink: 0, background: C.bgSurface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📦</div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 2px' }}>{item.item_name}</p>
                          {item.brand && <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 4px' }}>{item.brand}</p>}
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {item.estimated_value != null && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: C.bgSurface, color: C.textMuted }}>£{item.estimated_value.toLocaleString()}</span>
                            )}
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: sdlt.bg, color: sdlt.color }}>SDLT {item.sdlt_sensitivity}</span>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: stat.bg, color: stat.color }}>{item.status}</span>
                          </div>
                          {item.notes && <p style={{ fontSize: 11, color: C.textHint, marginTop: 4, fontStyle: 'italic', margin: '4px 0 0' }}>{item.notes}</p>}
                        </div>
                      </div>
                      {dec?.type === 'counter' && (
                        <div style={{ padding: '0 12px 8px', fontSize: 12, color: C.amberDark }}>
                          ⇄ Counter: {dec.counterValue != null ? `£${dec.counterValue.toLocaleString()}` : 'price TBD'}{dec.notes ? ` — ${dec.notes}` : ''}
                        </div>
                      )}
                      <div style={{ display: 'flex', borderTop: `0.5px solid ${C.border}` }}>
                        {(['accept', 'counter', 'reject'] as BuyerResponseType[]).map((type, i) => {
                          const active = dec?.type === type
                          const bg =
                            type === 'accept'  ? (active ? C.teal    : C.bg) :
                            type === 'reject'  ? (active ? '#F09595' : C.bg) :
                                                 (active ? '#EF9F27' : C.bg)
                          const color =
                            type === 'accept'  ? (active ? '#fff'      : C.textMuted) :
                            type === 'reject'  ? (active ? C.redDark   : C.textMuted) :
                                                 (active ? C.amberDark : C.textMuted)
                          return (
                            <button key={type}
                              onClick={() => type === 'counter' ? openCounter(item.item_name) : decide(item.item_name, type)}
                              style={{ flex: 1, padding: '10px 4px', border: 'none', borderRight: i < 2 ? `0.5px solid ${C.border}` : 'none', background: bg, color, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {type === 'accept' ? '✓ Accept' : type === 'reject' ? '✕ Reject' : '⇄ Counter'}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Sticky submit bar */}
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 500, background: C.bg, borderTop: `0.5px solid ${C.border}`, padding: '12px 16px', zIndex: 100 }}>
            {submitErr && <p style={{ fontSize: 12, color: C.redDark, marginBottom: 8 }}>{submitErr}</p>}
            <button onClick={submitResponses} disabled={submitting}
              style={{ width: '100%', padding: 15, background: allDecided ? C.purple : '#ccc', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: allDecided ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              {submitting
                ? 'Submitting...'
                : allDecided
                  ? 'Submit review'
                  : `${form.items.length - decided} item${form.items.length - decided !== 1 ? 's' : ''} remaining`}
            </button>
          </div>
        </div>
      </div>

      {/* Counter modal */}
      {counter.open && (
        <div onClick={() => setCounter(c => ({ ...c, open: false }))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.bg, borderRadius: '12px 12px 0 0', width: '100%', maxWidth: 500, padding: 24 }}>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Counter offer</p>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>{counter.name}</p>
            <label style={fieldLabel}>Your counter value (£)</label>
            <input style={fieldInput} type="number" placeholder="e.g. 300" value={counter.value} onChange={e => setCounter(c => ({ ...c, value: e.target.value }))} />
            <label style={{ ...fieldLabel, marginTop: 12 }}>Notes (optional)</label>
            <input style={fieldInput} type="text" placeholder="Reason for counter..." value={counter.notes} onChange={e => setCounter(c => ({ ...c, notes: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setCounter(c => ({ ...c, open: false }))}
                style={{ flex: 1, padding: 13, border: `0.5px solid ${C.border}`, borderRadius: 8, background: C.bg, fontSize: 14, color: C.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmCounter}
                style={{ flex: 2, padding: 13, background: C.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Confirm counter</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Shell({ children, property }: { children: React.ReactNode; property?: string }) {
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: '#f4f3f0', minHeight: '100vh' }}>
      <div style={{ maxWidth: 500, margin: '0 auto', background: '#fff', minHeight: '100vh' }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: '#370994', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11 }}>FFA</div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Buyer Review</p>
            {property && <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{property}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontFamily: "'Inter',sans-serif", background: '#f4f3f0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #EEEDFE', borderTopColor: '#370994', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: '#6b7280' }}>{label}</p>
        </div>
      </div>
    </>
  )
}
