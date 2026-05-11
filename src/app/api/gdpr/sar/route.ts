import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

// Subject Access Request — returns all data held for the requesting user
export const GET = withRBAC('gdpr:sar', async (req: NextRequest) => {
  const session = await getServerSession()
  const { searchParams } = new URL(req.url)
  // Admin can request on behalf of any user
  const targetUserId = searchParams.get('userId') ?? session!.user.id

  const [user, transactions, auditLogs, magicLinks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true, email: true, role: true, firstName: true, lastName: true,
        totpEnabled: true, firmId: true, deletedAt: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: { OR: [{ sellerId: targetUserId }, { buyerId: targetUserId }] },
      include: {
        fixturesItems: { where: { deletedAt: null } },
        enquiries: true,
        legalAcknowledgements: { where: { userId: targetUserId } },
        buyerAcceptances: { where: { buyerUserId: targetUserId } },
      },
    }),
    prisma.auditLog.findMany({ where: { userId: targetUserId }, orderBy: { createdAt: 'desc' } }),
    prisma.magicLink.findMany({ where: { userId: targetUserId } }),
  ])

  await writeAuditLog({
    eventType: 'SAR_REQUESTED',
    userId: session!.user.id,
    eventData: { targetUserId, requestedAt: new Date().toISOString() },
  })

  return NextResponse.json({ user, transactions, auditLogs, magicLinks })
})
