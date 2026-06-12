'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { SignOutButton } from '@/components/SignOutButton'

interface Mailbox {
  id: string
  displayName: string
  credential: { fromAddress: string; fromName: string } | null
}

interface Thread {
  id: string
  subject: string
  messageCount: number
  hasAttachments: boolean
  lastMessageAt: string | null
  messages: {
    fromName: string | null
    fromAddress: string
    bodyText: string | null
    isRead: boolean
    direction: 'INBOUND' | 'OUTBOUND'
    receivedAt: string
  }[]
}

interface Message {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  fromAddress: string
  fromName: string | null
  toAddresses: string[]
  ccAddresses: string[]
  subject: string
  bodyText: string | null
  bodyHtmlSafe: string | null
  isRead: boolean
  isStarred: boolean
  receivedAt: string
  attachments: { id: string; filename: string; mimeType: string; size: number }[]
}

interface FullThread {
  id: string
  mailboxId: string
  subject: string
  messages: Message[]
}

interface Props {
  mailboxes: Mailbox[]
  user: { id: string; name: string; role: string; firmId: string | null }
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function ComposeModal({
  mailboxId,
  defaultTo,
  defaultSubject,
  inReplyTo,
  threadId,
  onClose,
  onSent,
}: {
  mailboxId: string
  defaultTo?: string
  defaultSubject?: string
  inReplyTo?: string
  threadId?: string
  onClose: () => void
  onSent: () => void
}) {
  const [to, setTo] = useState(defaultTo ?? '')
  const [subject, setSubject] = useState(defaultSubject ?? '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const toList = to.split(',').map(e => e.trim()).filter(Boolean)
    if (!toList.length || !subject.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailboxId,
          to: toList,
          subject,
          bodyText: body,
          bodyHtml: `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`,
          inReplyTo,
          threadId,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(typeof d.error === 'string' ? d.error : 'Send failed')
        return
      }
      onSent()
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg pointer-events-auto border border-gray-200 flex flex-col"
           style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 text-white rounded-t-xl">
          <span className="font-semibold text-sm">{inReplyTo ? 'Reply' : 'New Message'}</span>
          <button onClick={onClose} className="text-gray-300 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input
            type="text"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="To (comma-separated)"
            className="w-full border-b border-gray-200 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full border-b border-gray-200 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={10}
            className="w-full text-sm focus:outline-none resize-none"
          />
          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t flex justify-end">
          <button
            onClick={send}
            disabled={sending || !to.trim() || !subject.trim()}
            className="bg-blue-900 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmailClient({ mailboxes, user }: Props) {
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(
    mailboxes[0]?.id ?? null,
  )
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [openThread, setOpenThread] = useState<FullThread | null>(null)
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [compose, setCompose] = useState<{
    to?: string
    subject?: string
    inReplyTo?: string
    threadId?: string
  } | null>(null)

  const selectedMailbox = mailboxes.find(m => m.id === selectedMailboxId)

  const loadThreads = useCallback(async (mailboxId: string) => {
    setLoadingThreads(true)
    setThreads([])
    setSelectedThreadId(null)
    setOpenThread(null)
    try {
      const res = await fetch(`/api/email/threads?mailboxId=${mailboxId}`)
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads ?? [])
      }
    } finally {
      setLoadingThreads(false)
    }
  }, [])

  useEffect(() => {
    if (selectedMailboxId) loadThreads(selectedMailboxId)
  }, [selectedMailboxId, loadThreads])

  async function selectThread(threadId: string) {
    setSelectedThreadId(threadId)
    setLoadingThread(true)
    try {
      const res = await fetch(`/api/email/threads/${threadId}`)
      if (res.ok) {
        const data = await res.json()
        setOpenThread(data)
        // Mark as read locally
        setThreads(prev => prev.map(t =>
          t.id === threadId
            ? { ...t, messages: t.messages.map(m => ({ ...m, isRead: true })) }
            : t,
        ))
      }
    } finally {
      setLoadingThread(false)
    }
  }

  const hasNoMailboxes = mailboxes.length === 0
  const isAdmin = user.role === 'ADMIN'

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-blue-900 text-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">FFA</span>
          </div>
          <span className="font-semibold text-sm">Email</span>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/email/mailboxes"
              className="text-white/80 hover:text-white text-sm"
            >
              Manage Mailboxes
            </Link>
          )}
          <Link href="/conveyancer" className="text-white/80 hover:text-white text-sm">Dashboard</Link>
          <SignOutButton />
        </div>
      </header>

      {hasNoMailboxes ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 flex-col gap-3">
          <p className="text-lg font-medium">No mailboxes configured</p>
          {isAdmin && (
            <Link href="/email/mailboxes/new" className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Add Mailbox
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Pane 1: Mailbox list */}
          <aside className="w-52 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
            <div className="px-3 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mailboxes</p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {mailboxes.map(mb => (
                <button
                  key={mb.id}
                  onClick={() => setSelectedMailboxId(mb.id)}
                  className={`w-full text-left px-3 py-2.5 text-sm transition ${
                    selectedMailboxId === mb.id
                      ? 'bg-blue-50 text-blue-900 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium truncate">{mb.displayName}</div>
                  {mb.credential && (
                    <div className="text-xs text-gray-400 truncate">{mb.credential.fromAddress}</div>
                  )}
                </button>
              ))}
            </div>
            {selectedMailboxId && (
              <div className="p-3 border-t border-gray-100">
                <button
                  onClick={() => setCompose({})}
                  className="w-full bg-blue-900 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition"
                >
                  + Compose
                </button>
              </div>
            )}
          </aside>

          {/* Pane 2: Thread list */}
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Inbox</p>
              <button
                onClick={() => selectedMailboxId && loadThreads(selectedMailboxId)}
                className="text-gray-400 hover:text-gray-600 text-xs"
                title="Refresh"
              >
                ↻
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingThreads ? (
                <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
              ) : threads.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">No messages yet</div>
              ) : (
                threads.map(thread => {
                  const latest = thread.messages[0]
                  const isUnread = latest && !latest.isRead && latest.direction === 'INBOUND'
                  return (
                    <button
                      key={thread.id}
                      onClick={() => selectThread(thread.id)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 transition ${
                        selectedThreadId === thread.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <span className={`text-sm truncate ${isUnread ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                          {latest ? (latest.fromName || latest.fromAddress) : '—'}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatDate(thread.lastMessageAt)}
                        </span>
                      </div>
                      <div className={`text-xs truncate mb-0.5 ${isUnread ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
                        {thread.subject}
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {latest?.bodyText?.replace(/\s+/g, ' ').substring(0, 80) ?? ''}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {thread.messageCount > 1 && (
                          <span className="text-xs text-gray-400">{thread.messageCount} msgs</span>
                        )}
                        {thread.hasAttachments && (
                          <span className="text-xs text-gray-400">📎</span>
                        )}
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 ml-auto flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Pane 3: Message view */}
          <div className="flex-1 overflow-y-auto bg-white flex flex-col">
            {loadingThread ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>
            ) : !openThread ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-2">
                <span className="text-4xl">✉</span>
                <p>Select a conversation</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">{openThread.subject}</h2>
                  <button
                    onClick={() => {
                      const last = openThread.messages[openThread.messages.length - 1]
                      setCompose({
                        to: last.fromAddress,
                        subject: openThread.subject.startsWith('Re:')
                          ? openThread.subject
                          : `Re: ${openThread.subject}`,
                        inReplyTo: last.id,
                        threadId: openThread.id,
                      })
                    }}
                    className="bg-blue-900 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-800 transition flex-shrink-0"
                  >
                    ↩ Reply
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                  {openThread.messages.map(msg => (
                    <div key={msg.id} className={`${msg.direction === 'OUTBOUND' ? 'ml-8' : 'mr-8'}`}>
                      <div className={`rounded-xl p-4 ${
                        msg.direction === 'OUTBOUND'
                          ? 'bg-blue-50 border border-blue-100'
                          : 'bg-white border border-gray-200 shadow-sm'
                      }`}>
                        {/* Message header */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                msg.direction === 'OUTBOUND' ? 'bg-blue-900 text-white' : 'bg-gray-200 text-gray-600'
                              }`}>
                                {(msg.fromName || msg.fromAddress).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {msg.fromName || msg.fromAddress}
                                </div>
                                <div className="text-xs text-gray-500">{msg.fromAddress}</div>
                              </div>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              To: {msg.toAddresses.join(', ')}
                              {msg.ccAddresses.length > 0 && ` · CC: ${msg.ccAddresses.join(', ')}`}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 flex-shrink-0">
                            {new Date(msg.receivedAt).toLocaleString()}
                          </div>
                        </div>

                        {/* Body */}
                        <div className="text-sm text-gray-800 leading-relaxed">
                          {msg.bodyHtmlSafe ? (
                            <div dangerouslySetInnerHTML={{ __html: msg.bodyHtmlSafe }} />
                          ) : (
                            <pre className="whitespace-pre-wrap font-sans">{msg.bodyText ?? ''}</pre>
                          )}
                        </div>

                        {/* Attachments */}
                        {msg.attachments.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                            {msg.attachments.map(att => (
                              <a
                                key={att.id}
                                href={`/api/email/attachments/${att.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 transition"
                              >
                                <span>📎</span>
                                <span className="font-medium">{att.filename}</span>
                                <span className="text-gray-400">({formatBytes(att.size)})</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Compose modal */}
      {compose && selectedMailboxId && (
        <ComposeModal
          mailboxId={selectedMailboxId}
          defaultTo={compose.to}
          defaultSubject={compose.subject}
          inReplyTo={compose.inReplyTo}
          threadId={compose.threadId}
          onClose={() => setCompose(null)}
          onSent={() => selectedMailboxId && loadThreads(selectedMailboxId)}
        />
      )}
    </div>
  )
}
