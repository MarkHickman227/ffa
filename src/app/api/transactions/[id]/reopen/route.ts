import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const ReopenSchema = z.object({
  reason: z.string().min(1).max(500),
})

// BR-013/014: Conveyancer reopens submitted form for seller revision
export const POST = withRBAC('conveyancer:manage', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = ReopenSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: { property: true, seller: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (tx.status !== TransactionStatus.SELLER_FORM_SUBMITTED) {
    return NextResponse.json(
      { error: 'Transaction must be in SELLER_FORM_SUBMITTED status to reopen' },
      { status: 409 },
    )
  }

  await prisma.transaction.update({
    where: { id: params.id },
    data: { status: TransactionStatus.SELLER_REVISION },
  })

  const address = `${tx.property.addressLine1}, ${tx.property.city} ${tx.property.postcode}`

  // BR-013: email seller requesting revision
  sendEmail({
    to: tx.seller.email,
    event: 'SELLER_REVISION_REQUESTED',
    data: {
      sellerName: `${tx.seller.firstName} ${tx.seller.lastName}`,
      address,
      reference: tx.reference,
      reason: parsed.data.reason,
      url: `${process.env.NEXTAUTH_URL}/seller/${tx.id}`,
    },
  }).catch(() => {})

  writeAuditLog({
    eventType: 'FORM_REOPENED_FOR_REVISION',
    transactionId: params.id,
    userId: (session?.user as any)?.id,
    eventData: { reason: parsed.data.reason },
  }).catch(() => {})

  return NextResponse.json({ reopened: true })
})
