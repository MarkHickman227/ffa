import { getServerSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MailboxForm } from '../MailboxForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add Mailbox — FFA' }

export default async function NewMailboxPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')
  const user = session.user as any
  if (!['ADMIN', 'CONVEYANCER'].includes(user.role)) redirect('/email')

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Add Mailbox</h1>
        <MailboxForm />
      </div>
    </main>
  )
}
