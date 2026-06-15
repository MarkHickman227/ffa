import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AddPersonPanel } from './AddPersonPanel'
import { DeletePersonButton } from './DeletePersonButton'

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  CONVEYANCER: 'Conveyancer',
  AGENT: 'Estate Agent',
  SELLER: 'Seller',
  BUYER: 'Buyer',
  BUYER_SOLICITOR: "Buyer's Solicitor",
}

const ROLE_COLOUR: Record<string, string> = {
  ADMIN:           'bg-red-50 text-red-700 ring-1 ring-red-200',
  CONVEYANCER:     'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  AGENT:           'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  SELLER:          'bg-green-50 text-green-700 ring-1 ring-green-200',
  BUYER:           'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  BUYER_SOLICITOR: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
}

const ROLE_HEADING_COLOUR: Record<string, string> = {
  ADMIN:           'text-red-700',
  CONVEYANCER:     'text-blue-700',
  AGENT:           'text-amber-700',
  SELLER:          'text-green-700',
  BUYER:           'text-purple-700',
  BUYER_SOLICITOR: 'text-indigo-700',
}

const ROLE_ORDER = ['ADMIN', 'CONVEYANCER', 'AGENT', 'BUYER_SOLICITOR', 'SELLER', 'BUYER']

export default async function PeoplePage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const [users, firms] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        firm: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.firm.findMany({ orderBy: { name: 'asc' } }),
  ])

  const grouped = users.reduce<Record<string, typeof users>>((acc, u) => {
    acc[u.role] = acc[u.role] ?? []
    acc[u.role].push(u)
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">People</span>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">People</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {users.length} {users.length === 1 ? 'person' : 'people'} across {Object.keys(grouped).length} roles
          </p>
        </div>

        {/* Inline add form */}
        <AddPersonPanel firms={firms} />

        {/* Role sections */}
        <div className="space-y-10">
          {ROLE_ORDER.filter(role => grouped[role]?.length).map(role => (
            <section key={role}>

              {/* Section heading */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className={`text-sm font-bold uppercase tracking-widest ${ROLE_HEADING_COLOUR[role]}`}>
                  {ROLE_LABEL[role] ?? role}
                </h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOUR[role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {grouped[role].length}
                </span>
                <div className="flex-1 border-t border-gray-100" />
              </div>

              {/* Person cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[role].map(u => (
                  <div
                    key={u.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition"
                  >
                    {/* Name + role badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-gray-900 leading-tight">
                          {u.firstName} {u.lastName}
                        </p>
                        {u.firm?.name && (
                          <p className="text-xs text-gray-400 mt-0.5">{u.firm.name}</p>
                        )}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLOUR[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </div>

                    {/* Contact details */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="truncate">{u.email}</span>
                      </div>
                      {u.phone ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span>{u.phone}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-gray-300">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="italic">No phone</span>
                        </div>
                      )}
                    </div>

                    <DeletePersonButton id={u.id} name={`${u.firstName} ${u.lastName}`} />
                  </div>
                ))}
              </div>

            </section>
          ))}

          {users.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-base font-medium mb-1">No people yet</p>
              <p className="text-sm">
                <Link href="/admin/new" className="text-blue-600 hover:underline">Add the first person</Link> to get started.
              </p>
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
