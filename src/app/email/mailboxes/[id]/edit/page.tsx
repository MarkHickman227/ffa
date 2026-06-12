import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { MailboxForm } from '../../MailboxForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function EditMailboxPage({ params }: { params: { id: string } }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')
  const user = session.user as any
  if (!['ADMIN', 'CONVEYANCER'].includes(user.role)) redirect('/email')

  const mailbox = await prisma.mailbox.findUnique({
    where: { id: params.id },
    include: { credential: { select: { fromName: true, fromAddress: true, smtpHost: true, smtpPort: true, imapHost: true, imapPort: true, smtpUser: true, imapUser: true } } },
  })
  if (!mailbox) notFound()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/email/mailboxes" className="text-blue-900 hover:underline text-sm">← Mailboxes</Link>
          <h1 className="text-xl font-bold text-gray-900">Edit Mailbox</h1>
        </div>
        <MailboxForm mailboxId={params.id} />
      </div>
    </main>
  )
}
