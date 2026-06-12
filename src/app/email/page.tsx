import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { EmailClient } from './EmailClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Email — FFA' }

export default async function EmailPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const user = session.user as any
  if (!['ADMIN', 'CONVEYANCER', 'AGENT'].includes(user.role)) redirect('/')

  const where =
    user.role === 'ADMIN'
      ? { isActive: true }
      : {
          firmId: user.firmId ?? '__none__',
          isActive: true,
          members: { some: { userId: user.id } },
        }

  const mailboxes = await prisma.mailbox.findMany({
    where,
    select: {
      id: true,
      displayName: true,
      credential: { select: { fromAddress: true, fromName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <EmailClient
      mailboxes={mailboxes}
      user={{ id: user.id, name: user.name ?? '', role: user.role, firmId: user.firmId ?? null }}
    />
  )
}
