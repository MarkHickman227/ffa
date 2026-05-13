export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { NextResponse } from 'next/server'

export const GET = withRBAC('transaction:read', async (_req, { params }) => {
  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      seller: { select: { id: true, firstName: true, lastName: true, email: true } },
      buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(tx)
})
