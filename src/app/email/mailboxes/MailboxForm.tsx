'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Fields {
  displayName: string
  fromName: string
  fromAddress: string
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPass: string
  imapHost: string
  imapPort: string
  imapUser: string
  imapPass: string
}

const defaultFields: Fields = {
  displayName: '',
  fromName: '',
  fromAddress: '',
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  imapHost: '',
  imapPort: '993',
  imapUser: '',
  imapPass: '',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function MailboxForm({ mailboxId }: { mailboxId?: string }) {
  const router = useRouter()
  const isEdit = !!mailboxId
  const [fields, setFields] = useState<Fields>(defaultFields)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function set(k: keyof Fields, v: string) {
    setFields(p => ({ ...p, [k]: v }))
    setResult(null)
  }

  async function handleTest() {
    if (!mailboxId) return
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch(`/api/email/mailboxes/${mailboxId}/test`, { method: 'POST' })
      const d = await res.json()
      setResult({ ok: res.ok, msg: res.ok ? d.message : (d.error ?? 'Test failed') })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    try {
      const url = isEdit ? `/api/email/mailboxes/${mailboxId}` : '/api/email/mailboxes'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          smtpPort: Number(fields.smtpPort),
          imapPort: Number(fields.imapPort),
        }),
      })
      const d = await res.json()
      if (res.ok) {
        router.push('/email/mailboxes')
      } else {
        const msg = typeof d.error === 'string' ? d.error : JSON.stringify(d.error)
        setResult({ ok: false, msg })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Display name */}
      <div className="bg-white rounded-xl shadow p-5">
        <Field label="Mailbox Name" hint='e.g. "Avalon Conveyancing Inbox"'>
          <input required value={fields.displayName} onChange={e => set('displayName', e.target.value)}
            placeholder="Avalon Conveyancing" className={inp} />
        </Field>
      </div>

      {/* Sender identity */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sender Identity</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From Name">
            <input required value={fields.fromName} onChange={e => set('fromName', e.target.value)}
              placeholder="Avalon Conveyancing" className={inp} />
          </Field>
          <Field label="From Email">
            <input required type="email" value={fields.fromAddress} onChange={e => set('fromAddress', e.target.value)}
              placeholder="conveyancing@yourdomain.com" className={inp} />
          </Field>
        </div>
      </div>

      {/* SMTP */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">SMTP (Outbound)</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Host">
              <input required value={fields.smtpHost} onChange={e => set('smtpHost', e.target.value)}
                placeholder="smtp.gmail.com" className={inp} />
            </Field>
          </div>
          <Field label="Port" hint="587 or 465">
            <input required type="number" value={fields.smtpPort} onChange={e => set('smtpPort', e.target.value)}
              className={inp} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input required type="email" value={fields.smtpUser} onChange={e => set('smtpUser', e.target.value)}
              placeholder="you@yourdomain.com" className={inp} />
          </Field>
          <Field label={isEdit ? 'Password (leave blank to keep)' : 'Password'}>
            <input required={!isEdit} type="password" value={fields.smtpPass}
              onChange={e => set('smtpPass', e.target.value)} placeholder="App password" className={inp} />
          </Field>
        </div>
      </div>

      {/* IMAP */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">IMAP (Inbound Sync)</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Host">
              <input required value={fields.imapHost} onChange={e => set('imapHost', e.target.value)}
                placeholder="imap.gmail.com" className={inp} />
            </Field>
          </div>
          <Field label="Port" hint="993 (SSL)">
            <input required type="number" value={fields.imapPort} onChange={e => set('imapPort', e.target.value)}
              className={inp} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input required type="email" value={fields.imapUser} onChange={e => set('imapUser', e.target.value)}
              placeholder="you@yourdomain.com" className={inp} />
          </Field>
          <Field label={isEdit ? 'Password (leave blank to keep)' : 'Password'}>
            <input required={!isEdit} type="password" value={fields.imapPass}
              onChange={e => set('imapPass', e.target.value)} placeholder="App password" className={inp} />
          </Field>
        </div>
      </div>

      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium flex items-start gap-2 ${
          result.ok
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <span className="font-bold">{result.ok ? '✓' : '✗'}</span>
          <span>{result.msg}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/email/mailboxes"
          className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          Cancel
        </Link>
        {isEdit && (
          <button type="button" onClick={handleTest} disabled={testing}
            className="flex-1 border-2 border-blue-900 text-blue-900 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-50 disabled:opacity-40 transition">
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
        )}
        <button type="submit" disabled={saving}
          className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Mailbox'}
        </button>
      </div>
    </form>
  )
}
