import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

// BR-011/012: Conveyancer reviews open enquiries then routes to seller + copies agent
export const POST = withRBAC('conveyancer:manage', async (_req: NextRequest, { params }) => {
  const session = await getServerSession()

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      seller: true,
      agentUser: true,
      enquiries: { where: { status: 'OPEN', routedAt: null } },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (tx.status !== TransactionStatus.BUYER_REVIEW) {
    return NextResponse.json({ error: 'Transaction must be in BUYER_REVIEW status' }, { status: 409 })
  }

  const unrouted = tx.enquiries
  if (unrouted.length === 0) {
    return NextResponse.json({ error: 'No unrouted enquiries to forward' }, { status: 422 })
  }

  // Mark enquiries as routed + move transaction to SELLER_REVISION
  await prisma.$transaction([
    prisma.enquiry.updateMany({
      where: { id: { in: unrouted.map((e) => e.id) } },
      data: { routedAt: new Date() },
    }),
    prisma.transaction.update({
      where: { id: params.id },
      data: { status: TransactionStatus.SELLER_REVISION },
    }),
  ])

  const address = `${tx.property.addressLine1}, ${tx.property.city} ${tx.property.postcode}`
  const summary = `${unrouted.length} question(s) have been forwarded to you for review.`

  // BR-012: notify seller (editable link) + copy agent
  sendEmail({
    to: tx.seller.email,
    event: 'ENQUIRY_ROUTED_TO_SELLER',
    data: {
      sellerName: `${tx.seller.firstName} ${tx.seller.lastName}`,
      address,
      reference: tx.reference,
      summary,
      url: `${process.env.NEXTAUTH_URL}/seller/${tx.id}`,
    },
  }).catch(() => {})

  if (tx.agentUser) {
    sendEmail({
      to: tx.agentUser.email,
      event: 'ENQUIRY_COPY_TO_AGENT',
      data: { address, reference: tx.reference },
    }).catch(() => {})
  }

  writeAuditLog({
    eventType: 'QUESTIONS_ROUTED_TO_SELLER',
    transactionId: params.id,
    userId: (session?.user as any)?.id,
    eventData: { enquiryCount: unrouted.length },
  }).catch(() => {})

  return NextResponse.json({ routed: unrouted.length })
})
