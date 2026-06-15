export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { getServerSession } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const DELETE = withRBAC('admin:all', async (_req, { params }) => {
  const session = await getServerSession()
  const adminUserId = (session?.user as any)?.id as string | undefined

  const user = await prisma.user.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { id: true, role: true, email: true, firstName: true, lastName: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Prevent deleting the last admin
  if (user.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN', deletedAt: null } })
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the only admin account' }, { status: 409 })
    }
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  writeAuditLog({
    eventType: 'USER_DELETED',
    userId: adminUserId,
    eventData: { deletedUserId: user.id, email: user.email, role: user.role },
  }).catch(() => {})

  return new NextResponse(null, { status: 204 })
})
