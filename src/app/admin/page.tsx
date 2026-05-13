import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@/components/SignOutButton'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const [userCount, txCount, recentLogs] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.transaction.count({ where: { deletedAt: null } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        eventType: true,
        createdAt: true,
        ipAddress: true,
        user: { select: { email: true } },
      },
    }),
  ])

  const transactions = await prisma.transaction.findMany({
    where: { deletedAt: null },
    include: {
      property: { select: { addressLine1: true, city: true, postcode: true } },
      seller: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Transactions</h2>
            <div className="space-y-2">
              {transactions.map((tx) => (
                <Link
                  key={tx.id}
                  href={`/conveyancer/${tx.id}`}
                  className="block bg-white rounded-lg shadow hover:shadow-md transition p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-semibold text-blue-900">{tx.reference}</span>
                      <p className="text-sm text-gray-700 truncate">
                        {tx.property.addressLine1}, {tx.property.postcode}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">{tx.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Recent Audit Log</h2>
            <div className="bg-white rounded-xl shadow divide-y divide-gray-100">
              {recentLogs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-blue-800">{log.eventType}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(log.createdAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
                    </span>
                  </div>
                  {log.user && (
                    <p className="text-xs text-gray-500 mt-0.5">{log.user.email}</p>
                  )}
                </div>
              ))}
              {recentLogs.length === 0 && (
                <div className="px-4 py-6 text-sm text-gray-400 text-center">No audit events yet</div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <Link href="/api/admin/audit-logs" className="block text-sm text-blue-700 hover:underline">
                View all audit logs (JSON)
              </Link>
              <Link href="/api/gdpr/sar" className="block text-sm text-blue-700 hover:underline">
                Subject Access Request (your data)
              </Link>
              <Link href="/api/gdpr/retention-purge?dry-run=true" className="block text-sm text-blue-700 hover:underline">
                Retention purge dry run
              </Link>
              <Link href="/api/health" className="block text-sm text-blue-700 hover:underline">
                Health check
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
