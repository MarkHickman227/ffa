import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@/components/SignOutButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manage Mailboxes — FFA' }

export default async function MailboxesPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const user = session.user as any
  if (!['ADMIN', 'CONVEYANCER'].includes(user.role)) redirect('/email')

  const mailboxes = await prisma.mailbox.findMany({
    where: user.role === 'ADMIN' ? {} : { firmId: user.firmId ?? '__none__' },
    include: {
      credential: { select: { fromAddress: true, fromName: true, smtpHost: true, imapHost: true } },
      _count: { select: { members: true, messages: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/email" className="text-blue-900 hover:underline text-sm">← Email</Link>
            <h1 className="text-xl font-bold text-gray-900">Manage Mailboxes</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/email/mailboxes/new"
              className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition"
            >
              + Add Mailbox
            </Link>
            <SignOutButton />
          </div>
        </div>

        {mailboxes.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
            No mailboxes configured.{' '}
            <Link href="/email/mailboxes/new" className="text-blue-900 underline">Add one now.</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {mailboxes.map(mb => (
              <div key={mb.id} className="bg-white rounded-xl shadow p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{mb.displayName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${mb.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {mb.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {mb.credential && (
                      <div className="text-sm text-gray-500 space-y-0.5">
                        <div>{mb.credential.fromName} &lt;{mb.credential.fromAddress}&gt;</div>
                        <div className="text-xs text-gray-400">
                          SMTP: {mb.credential.smtpHost} · IMAP: {mb.credential.imapHost}
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {mb._count.members} member{mb._count.members !== 1 ? 's' : ''} ·{' '}
                      {mb._count.messages} message{mb._count.messages !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/email/mailboxes/${mb.id}/edit`}
                      className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
