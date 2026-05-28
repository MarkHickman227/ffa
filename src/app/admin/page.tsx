import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@/components/SignOutButton'
import { DeleteTxButton } from './DeleteTxButton'

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

const LIVE_STATUSES = new Set(['DRAFT', 'SELLER_FORM_IN_PROGRESS', 'SELLER_FORM_SUBMITTED', 'BUYER_REVIEW', 'BUYER_ACCEPTED'])
const COMPLETED_STATUSES = new Set(['EXCHANGE_COMPLETE', 'ARCHIVED'])

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SELLER_FORM_IN_PROGRESS: 'bg-blue-50 text-blue-700',
  SELLER_FORM_SUBMITTED: 'bg-indigo-50 text-indigo-700',
  BUYER_REVIEW: 'bg-amber-50 text-amber-700',
  BUYER_ACCEPTED: 'bg-purple-50 text-purple-700',
  EXCHANGE_COMPLETE: 'bg-green-50 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

export default async function AdminDashboard() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const [userCount, txCount, transactions, emailSettings] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.transaction.count({ where: { deletedAt: null } }),
    prisma.transaction.findMany({
      where: { deletedAt: null },
      include: {
        property: { select: { addressLine1: true, city: true, postcode: true } },
        seller: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.systemSettings.findFirst({ select: { isEmailConfigured: true } }),
  ])

  const isAdmin = (session.user as any).role === 'ADMIN'
  const showEmailBanner = isAdmin && !emailSettings?.isEmailConfigured

  const live = transactions.filter((tx) => LIVE_STATUSES.has(tx.status))
  const completed = transactions.filter((tx) => COMPLETED_STATUSES.has(tx.status))

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">FFA</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">{session.user.name}</p>
            </div>
          </div>
          <SignOutButton />
        </div>

        {/* Email unconfigured banner */}
        {showEmailBanner && (
          <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-6 text-sm text-amber-900">
            <span>⚠️ <strong>Action Required:</strong> Email is not configured — notifications and form invitations will not be sent.</span>
            <Link
              href="/admin/settings/email"
              className="flex-shrink-0 text-xs font-semibold bg-amber-200 hover:bg-amber-300 text-amber-900 px-3 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              Configure Email →
            </Link>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mb-8 flex-wrap">
          <Link
            href="/admin/new"
            className="flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 transition"
          >
            <span className="text-lg leading-none">+</span> Add Person
          </Link>
          <Link
            href="/admin/new?tab=transaction"
            className="flex items-center gap-2 border border-blue-900 text-blue-900 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-50 transition"
          >
            <span className="text-lg leading-none">+</span> Add Transaction
          </Link>
          {isAdmin && (
            <Link
              href="/admin/settings/email"
              className="flex items-center gap-2 border border-gray-300 text-gray-600 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition ml-auto"
            >
              ✉ Email Settings
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-sm text-gray-500 mb-1">Total Users</p>
            <p className="text-3xl font-bold text-gray-900">{userCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-sm text-gray-500 mb-1">Transactions</p>
            <p className="text-3xl font-bold text-gray-900">{txCount}</p>
          </div>
        </div>

        {/* Live transactions */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Live</h2>
            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{live.length}</span>
          </div>
          <div className="space-y-2">
            {live.length === 0 && <p className="text-sm text-gray-400 italic">No live transactions</p>}
            {live.map((tx) => <TxRow key={tx.id} tx={tx} statusLabel={STATUS_LABEL} statusColour={STATUS_COLOUR} />)}
          </div>
        </div>

        {/* Completed transactions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Completed</h2>
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">{completed.length}</span>
          </div>
          <div className="space-y-2">
            {completed.length === 0 && <p className="text-sm text-gray-400 italic">No completed transactions</p>}
            {completed.map((tx) => <TxRow key={tx.id} tx={tx} statusLabel={STATUS_LABEL} statusColour={STATUS_COLOUR} />)}
          </div>
        </div>

      </div>
    </main>
  )
}

const LOCKED_STATUSES = new Set(['EXCHANGE_COMPLETE', 'ARCHIVED'])

function TxRow({ tx, statusLabel, statusColour }: {
  tx: { id: string; reference: string; status: string; property: { addressLine1: string; city: string; postcode: string }; seller: { firstName: string; lastName: string } }
  statusLabel: Record<string, string>
  statusColour: Record<string, string>
}) {
  const isLocked = LOCKED_STATUSES.has(tx.status)
  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition p-4">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/conveyancer/${tx.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-mono text-sm font-semibold text-blue-900">{tx.reference}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColour[tx.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {statusLabel[tx.status] ?? tx.status}
            </span>
            {isLocked && (
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
                Locked
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 truncate">{tx.property.addressLine1}, {tx.property.city} {tx.property.postcode}</p>
          <p className="text-xs text-gray-400 mt-0.5">Seller: {tx.seller.firstName} {tx.seller.lastName}</p>
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isLocked && <DeleteTxButton txId={tx.id} reference={tx.reference} />}
          <Link
            href={`/admin/transactions/${tx.id}`}
            className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 transition"
          >
            Edit
          </Link>
          <Link href={`/conveyancer/${tx.id}`} className="text-gray-300 text-lg">→</Link>
        </div>
      </div>
    </div>
  )
}
