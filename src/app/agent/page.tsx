import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { AgentDashboardClient } from './AgentDashboardClient'

export const dynamic = 'force-dynamic'

export default async function AgentHomePage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const transactions = await prisma.transaction.findMany({
    where: { deletedAt: null },
    include: {
      property: { select: { addressLine1: true, city: true, postcode: true } },
      seller: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <AgentDashboardClient
      transactions={transactions}
      userName={session.user.name ?? ''}
    />
  )
}
