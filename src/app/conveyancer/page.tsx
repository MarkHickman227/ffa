import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@/components/SignOutButton'
import { NewTransactionModal } from '@/components/NewTransactionModal'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SELLER_FORM_IN_PROGRESS: 'Seller in progress',
  SELLER_FORM_SUBMITTED: 'Seller submitted',
  BUYER_REVIEW: 'Buyer reviewing',
  BUYER_ACCEPTED: 'Buyer accepted',
  EXCHANGE_COMPLETE: 'Exchanged',
  ARCHIVED: 'Archived',
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SELLER_FORM_IN_PROGRESS: 'bg-yellow-50 text-yellow-700',
  SELLER_FORM_SUBMITTED: 'bg-blue-50 text-blue-700',
  BUYER_REVIEW: 'bg-purple-50 text-purple-700',
  BUYER_ACCEPTED: 'bg-green-50 text-green-700',
  EXCHANGE_COMPLETE: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-gray-100 text-gray-400',
}

export default async function ConveyancerHomePage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const user = session.user as any
  const firmId = user.firmId as string | null

  const transactions = await prisma.transaction.findMany({
    where: {
      conveyancerFirmId: firmId ?? undefined,
      deletedAt: null,
    },
    include: {
      property: { select: { addressLine1: true, city: true, postcode: true } },
      seller: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">FFA</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Conveyancer Dashboard</h1>
              <p className="text-sm text-gray-500">{session.user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NewTransactionModal />
            <SignOutButton />
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
            No transactions assigned to your firm yet.
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <Link
                key={tx.id}
                href={`/conveyancer/${tx.id}`}
                className="block bg-white rounded-xl shadow hover:shadow-md transition p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-blue-900">{tx.reference}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOUR[tx.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[tx.status] ?? tx.status}
                      </span>
                    </div>
                    <p className="text-gray-800 font-medium truncate">
                      {tx.property.addressLine1}, {tx.property.city} {tx.property.postcode}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Seller: {tx.seller.firstName} {tx.seller.lastName}
                    </p>
                  </div>
                  <span className="text-gray-400 text-lg flex-shrink-0">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
