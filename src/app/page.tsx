import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getServerSession()
  const user = session?.user as any
  const role = user?.role as string | undefined

  if (role === 'CONVEYANCER') redirect('/conveyancer')
  if (role === 'ADMIN') redirect('/admin')
  if (role === 'AGENT') redirect('/agent')

  if (role === 'SELLER') {
    const tx = await prisma.transaction.findFirst({
      where: { sellerId: user.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    if (tx) redirect(`/seller/${tx.id}`)
  }

  if (role === 'BUYER') {
    const tx = await prisma.transaction.findFirst({
      where: { buyerId: user.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    if (tx) redirect(`/buyer/${tx.id}`)
  }

  if (role === 'SURVEYOR') {
    const access = await prisma.surveyorAccess.findFirst({
      where: { surveyorUserId: user.id, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    })
    if (access) redirect(`/surveyor/${access.transactionId}`)
  }

  if (role) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-xl shadow p-8 text-center">
          <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-6 mx-auto">
            <span className="text-white font-bold text-lg">FFA</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Welcome, {session?.user?.name}</h1>
          <p className="text-gray-600 mb-6">
            No active transaction found for your account. Contact your conveyancer for access.
          </p>
          <Link href="/auth/signin" className="text-sm text-gray-400 hover:underline">
            Sign in with a different account
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-xl shadow p-8">
        <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-6">
          <span className="text-white font-bold text-lg">FFA</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Fixtures &amp; Fittings Assurance</h1>
        <p className="text-gray-600 mb-8">
          The UK&apos;s digital TA10 platform for sellers, buyers, conveyancers, agents, and surveyors.
        </p>
        <Link
          href="/auth/signin"
          className="block w-full bg-blue-900 text-white py-3 rounded-lg font-semibold text-center hover:bg-blue-800 transition"
        >
          Sign In
        </Link>
      </div>
    </main>
  )
}
