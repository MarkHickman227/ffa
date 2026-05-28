import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AdminForms } from '../AdminForms'

export const dynamic = 'force-dynamic'

export default async function AdminNewPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const [firms, staffUsers] = await Promise.all([
    prisma.firm.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { deletedAt: null, role: { in: ['CONVEYANCER', 'AGENT', 'SURVEYOR', 'SELLER', 'BUYER', 'BUYER_SOLICITOR'] } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
    }),
  ])

  const defaultTab = searchParams.tab === 'transaction' ? 'transaction' : 'person'

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold">FFA</span>
          </div>
          <div className="flex-1">
            <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900">Add Person / Transaction</h1>
          </div>
        </div>

        <AdminForms firms={firms} staffUsers={staffUsers} defaultTab={defaultTab} />

      </div>
    </main>
  )
}
