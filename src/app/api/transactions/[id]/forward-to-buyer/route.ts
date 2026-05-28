import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

export const POST = withRBAC('conveyancer:manage', async (_req: NextRequest, { params }) => {
  const session = await getServerSession()

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      buyer: true,
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // BR-005: must be in SELLER_FORM_SUBMITTED to forward
  if (tx.status !== TransactionStatus.SELLER_FORM_SUBMITTED) {
    return NextResponse.json(
      { error: 'Transaction must be in SELLER_FORM_SUBMITTED status to forward to buyer' },
      { status: 409 },
    )
  }

  if (!tx.buyer) {
    return NextResponse.json({ error: 'No buyer assigned to this transaction' }, { status: 422 })
  }

  await prisma.transaction.update({
    where: { id: params.id },
    data: { status: TransactionStatus.BUYER_REVIEW },
  })

  const address = `${tx.property.addressLine1}, ${tx.property.city} ${tx.property.postcode}`

  // BR-007: notify buyer with form link
  sendEmail({
    to: tx.buyer.email,
    event: 'BUYER_REVIEW_READY',
    data: {
      buyerName: `${tx.buyer.firstName} ${tx.buyer.lastName}`,
      address,
      reference: tx.reference,
      url: `${process.env.NEXTAUTH_URL}/buyer/${tx.id}`,
    },
  }).catch(() => {})

  writeAuditLog({
    eventType: 'FORWARDED_TO_BUYER',
    transactionId: params.id,
    userId: (session?.user as any)?.id,
    eventData: { buyerId: tx.buyer.id },
  }).catch(() => {})

  return NextResponse.json({ forwarded: true })
})
