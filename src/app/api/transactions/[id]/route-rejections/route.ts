import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

// BR-018/019: Conveyancer routes buyer rejections to seller + copies agent
export const POST = withRBAC('conveyancer:manage', async (_req: NextRequest, { params }) => {
  const session = await getServerSession()

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      seller: true,
      agentUser: true,
      buyerItemResponses: {
        where: { response: 'reject' },
        include: { fixturesItem: { select: { description: true, room: true } } },
      },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (tx.status !== TransactionStatus.BUYER_REVIEW) {
    return NextResponse.json({ error: 'Transaction must be in BUYER_REVIEW status' }, { status: 409 })
  }

  const rejections = tx.buyerItemResponses
  if (rejections.length === 0) {
    return NextResponse.json({ error: 'No rejected items to forward' }, { status: 422 })
  }

  await prisma.transaction.update({
    where: { id: params.id },
    data: { status: TransactionStatus.SELLER_REVISION },
  })

  const address = `${tx.property.addressLine1}, ${tx.property.city} ${tx.property.postcode}`
  const count = String(rejections.length)

  // BR-018: notify seller of rejections
  sendEmail({
    to: tx.seller.email,
    event: 'REJECTION_ROUTED_TO_SELLER',
    data: {
      sellerName: `${tx.seller.firstName} ${tx.seller.lastName}`,
      address,
      reference: tx.reference,
      count,
      url: `${process.env.NEXTAUTH_URL}/seller/${tx.id}`,
    },
  }).catch(() => {})

  // BR-019: copy agent
  if (tx.agentUser) {
    sendEmail({
      to: tx.agentUser.email,
      event: 'REJECTION_COPY_TO_AGENT',
      data: { address, reference: tx.reference, count },
    }).catch(() => {})
  }

  writeAuditLog({
    eventType: 'REJECTIONS_ROUTED_TO_SELLER',
    transactionId: params.id,
    userId: (session?.user as any)?.id,
    eventData: { rejectionCount: rejections.length },
  }).catch(() => {})

  return NextResponse.json({ routed: rejections.length })
})
