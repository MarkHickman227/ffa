import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  CONVEYANCER: 'Conveyancer',
  AGENT: 'Agent',
  SELLER: 'Seller',
  BUYER: 'Buyer',
  BUYER_SOLICITOR: "Buyer's Solicitor",
}

const ROLE_COLOUR: Record<string, string> = {
  ADMIN: 'bg-red-50 text-red-700',
  CONVEYANCER: 'bg-blue-50 text-blue-700',
  AGENT: 'bg-amber-50 text-amber-700',
  SELLER: 'bg-green-50 text-green-700',
  BUYER: 'bg-purple-50 text-purple-700',
  BUYER_SOLICITOR: 'bg-indigo-50 text-indigo-700',
}

export default async function PeoplePage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      firm: { select: { name: true } },
      createdAt: true,
    },
    orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
  })

  const grouped = users.reduce<Record<string, typeof users>>((acc, u) => {
    acc[u.role] = acc[u.role] ?? []
    acc[u.role].push(u)
    return acc
  }, {})

  const roleOrder = ['ADMIN', 'CONVEYANCER', 'AGENT', 'SELLER', 'BUYER', 'BUYER_SOLICITOR']

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">People</span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">All People</h1>
            <p className="text-sm text-gray-500">{users.length} {users.length === 1 ? 'person' : 'people'} registered</p>
          </div>
          <Link
            href="/admin/new"
            className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition"
          >
            <span className="text-base leading-none">+</span> Add Person
          </Link>
        </div>

        <div className="space-y-8">
          {roleOrder.filter(r => grouped[r]?.length).map(role => (
            <div key={role}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  {ROLE_LABEL[role] ?? role}
                </h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOUR[role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {grouped[role].length}
                </span>
              </div>

              <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">Email</th>
                      <th className="text-left px-4 py-3 font-medium">Phone</th>
                      <th className="text-left px-4 py-3 font-medium">Firm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {grouped[role].map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {u.firstName} {u.lastName}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{u.email}</td>
                        <td className="px-4 py-3 text-gray-500">{u.phone ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{u.firm?.name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <p className="text-sm text-gray-400 italic">No people registered yet.</p>
          )}
        </div>

      </div>
    </main>
  )
}
