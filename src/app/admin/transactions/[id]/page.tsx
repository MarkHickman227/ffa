import { prisma } from '@/lib/prisma'
import { getServerSession } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EditTransactionForm } from './EditTransactionForm'

export const dynamic = 'force-dynamic'

const LOCKED_STATUSES = ['EXCHANGE_COMPLETE', 'ARCHIVED']

export default async function EditTransactionPage({ params }: { params: { id: string } }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const [tx, firms, staffUsers] = await Promise.all([
    prisma.transaction.findUnique({
      where: { id: params.id, deletedAt: null },
      include: {
        property: true,
        seller: { select: { firstName: true, lastName: true, email: true, phone: true } },
        buyer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        conveyancerUser: { select: { id: true, firstName: true, lastName: true } },
        agentUser: { select: { id: true, firstName: true, lastName: true } },
        conveyancerFirm: { select: { id: true, name: true } },
      },
    }),
    prisma.firm.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { role: { in: ['CONVEYANCER', 'AGENT', 'BUYER_SOLICITOR'] }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
      orderBy: { firstName: 'asc' },
    }),
  ])

  if (!tx) notFound()

  const isLocked = LOCKED_STATUSES.includes(tx.status)

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">{tx.reference}</span>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {isLocked ? 'View Transaction' : 'Edit Transaction'}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {tx.reference} · {tx.property.addressLine1}, {tx.property.city} {tx.property.postcode}
        </p>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
            This transaction is <strong>{tx.status.replace(/_/g, ' ')}</strong> and cannot be edited.
          </div>
        )}

        <EditTransactionForm
          tx={{
            ...tx,
            valuationDate: tx.valuationDate?.toISOString() ?? null,
            scheduledExchangeDate: tx.scheduledExchangeDate?.toISOString() ?? null,
          }}
          firms={firms}
          staffUsers={staffUsers}
          isLocked={isLocked}
        />
      </div>
    </main>
  )
}
