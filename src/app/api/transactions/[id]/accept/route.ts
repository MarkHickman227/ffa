import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { emitWebhookEvent } from '@/lib/webhooks'
import { sendEmail } from '@/lib/email'
import { EnquiryStatus, TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const AcceptSchema = z.object({
  ipAddress: z.string(),
  userAgent: z.string(),
})

const ACCEPTANCE_TEXT =
  'I confirm that I have reviewed the Fixtures & Fittings schedule and accept it as part of my purchase of the above property. I understand that this acceptance is legally binding and forms part of the contract of sale.'

export const POST = withRBAC('buyer_form:accept', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = AcceptSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()

  // Gate: no open enquiries
  const openEnquiries = await prisma.enquiry.count({
    where: { transactionId: params.id, status: EnquiryStatus.OPEN },
  })
  if (openEnquiries > 0) {
    return NextResponse.json(
      { error: `Cannot accept: ${openEnquiries} open enquiry(s) must be resolved first` },
      { status: 422 },
    )
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      fixturesItems: { where: { deletedAt: null } },
      property: true,
      seller: true,
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (tx.status !== TransactionStatus.BUYER_REVIEW) {
    return NextResponse.json({ error: 'Transaction not in buyer review state' }, { status: 409 })
  }

  await prisma.$transaction(async (db) => {
    await db.buyerAcceptance.create({
      data: {
        transactionId: params.id,
        buyerUserId: session!.user.id,
        ipAddress: parsed.data.ipAddress,
        userAgent: parsed.data.userAgent,
        acceptanceText: ACCEPTANCE_TEXT,
        fixturesSnapshot: tx.fixturesItems as any,
      },
    })

    await db.transaction.update({
      where: { id: params.id },
      data: {
        status: TransactionStatus.BUYER_ACCEPTED,
        buyerAcceptedAt: new Date(),
      },
    })
  })

  await writeAuditLog({
    eventType: 'BUYER_ACCEPTED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { itemCount: tx.fixturesItems.length },
    ipAddress: parsed.data.ipAddress,
  })

  await emitWebhookEvent('BUYER_ACCEPTED', params.id, { buyerId: session!.user.id })

  const address = `${tx.property.addressLine1}, ${tx.property.city} ${tx.property.postcode}`
  await sendEmail({
    to: tx.seller.email,
    event: 'BUYER_ACCEPTED',
    data: { address, reference: tx.reference, acceptedAt: new Date().toISOString() },
  }).catch(() => {/* non-blocking */})

  return NextResponse.json({ accepted: true })
})
