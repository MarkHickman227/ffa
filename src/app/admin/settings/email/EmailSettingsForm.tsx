'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Settings {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  emailFromName: string
  emailFromAddress: string
  isEmailConfigured: boolean
}

type Result = { ok: boolean; msg: string } | null

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function ResultBanner({ result }: { result: Result }) {
  if (!result) return null
  return (
    <div className={`rounded-lg px-4 py-3 text-sm font-medium flex items-start gap-2 ${
      result.ok
        ? 'bg-green-50 text-green-800 border border-green-200'
        : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      <span className="flex-shrink-0 font-bold">{result.ok ? '✓' : '✗'}</span>
      <span>{result.msg}</span>
    </div>
  )
}

export function EmailSettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState<Settings>(initial)
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveResult, setSaveResult] = useState<Result>(null)
  const [testResult, setTestResult] = useState<Result>(null)

  function set(field: keyof Settings, value: string | number | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaveResult(null)
    setTestResult(null)
  }

  function buildPayload() {
    return {
      ...form,
      smtpHost: form.smtpHost || 'smtp.gmail.com',
      smtpPort: form.smtpPort || 587,
      // Strip spaces from App Passwords copied with spaces from Google
      smtpPass: form.smtpPass.replace(/\s/g, ''),
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json()
      const testMsg = res.ok
        ? (data.message ?? 'Test succeeded')
        : (typeof data.error === 'string' ? data.error : (data.error?.formErrors?.[0] ?? data.error?.fieldErrors ? Object.values(data.error.fieldErrors as Record<string, string[]>).flat()[0] : null) ?? 'Test failed')
      setTestResult({ ok: res.ok, msg: testMsg })
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? 'Network error' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveResult(null)
    try {
      const res = await fetch('/api/admin/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(), isEmailConfigured: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveResult({ ok: true, msg: 'Settings saved. Email is now active.' })
        setForm(prev => ({ ...prev, isEmailConfigured: true }))
      } else {
        const msg = data.error?.formErrors?.[0]
          ?? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
          ?? 'Save failed'
        setSaveResult({ ok: false, msg })
      }
    } catch (err: any) {
      setSaveResult({ ok: false, msg: err.message ?? 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <form onSubmit={handleSave} className="space-y-5">

      {/* Status badge */}
      {form.isEmailConfigured ? (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          Email is configured and active.
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
          Email is not yet configured. Fill in the fields below and click <strong className="ml-1">Save Settings</strong>.
        </div>
      )}

      {/* SMTP Server */}
      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">SMTP Server</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Host" hint="e.g. smtp.gmail.com · smtp.office365.com">
              <input
                type="text"
                value={form.smtpHost}
                placeholder="smtp.gmail.com"
                onChange={e => set('smtpHost', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <div>
            <Field label="Port" hint="587 = STARTTLS · 465 = SSL">
              <input
                type="number"
                value={form.smtpPort}
                placeholder="587"
                min={1} max={65535}
                onChange={e => set('smtpPort', Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Credentials */}
      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Credentials</p>

        <Field label="SMTP Username (Email Address) *">
          <input
            required
            type="email"
            value={form.smtpUser}
            placeholder="you@yourdomain.com"
            onChange={e => set('smtpUser', e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Password / App Password *">
          <input
            required={!initial.smtpPass}
            type="password"
            value={form.smtpPass}
            placeholder={initial.smtpPass === '***' ? 'Saved — enter new value to change' : 'Enter password'}
            onChange={e => set('smtpPass', e.target.value)}
            className={inputCls}
          />
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
            <strong>Gmail / Google Workspace:</strong> Enter your 16-character <em>App Password</em> — NOT your standard login password.
            Spaces are stripped automatically if copied incorrectly.
            {' '}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank" rel="noreferrer"
              className="underline font-semibold"
            >
              Generate App Password →
            </a>
            <br />
            <strong className="mt-1 block">Outlook / M365:</strong> Use your regular password, or an App Password if MFA is enabled.
          </div>
        </Field>
      </div>

      {/* Sender Identity */}
      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sender Identity</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From Name" hint='e.g. "FFA" or "Avalon Conveyancing"'>
            <input
              type="text"
              value={form.emailFromName}
              placeholder="FFA"
              onChange={e => set('emailFromName', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="From Email Address" hint="Defaults to SMTP username if left blank">
            <input
              type="email"
              value={form.emailFromAddress}
              placeholder="noreply@yourdomain.com"
              onChange={e => set('emailFromAddress', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      <ResultBanner result={testResult} />
      <ResultBanner result={saveResult} />

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/admin"
          className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          ← Back to Admin
        </Link>
        <button
          type="button"
          disabled={testing || !form.smtpUser}
          onClick={handleTest}
          className="flex-1 border-2 border-blue-900 text-blue-900 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-50 disabled:opacity-40 transition"
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          type="submit"
          disabled={saving || !form.smtpUser}
          className="flex-1 bg-blue-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

    </form>
  )
}
