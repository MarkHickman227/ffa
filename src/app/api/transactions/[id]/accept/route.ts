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
  'I confirm that I have reviewed the fixtures and fittings list for this property and I formally accept this list as part of the contract for purchase. I understand that the items listed as included form part of my purchase and any items listed as excluded do not. I acknowledge that this acceptance has been recorded at the date and time shown and at the list version stated above.'

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
      buyer: true,
      agentUser: true,
      conveyancerFirm: {
        include: {
          users: {
            where: { role: 'CONVEYANCER', deletedAt: null },
            select: { email: true, firstName: true, lastName: true },
          },
        },
      },
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
  const acceptedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
  const emailData = { address, reference: tx.reference, acceptedAt }

  // BR-009: notify Seller, Buyer, Estate Agent, and Conveyancer(s)
  const recipients: { email: string; name: string }[] = [
    { email: tx.seller.email, name: `${tx.seller.firstName} ${tx.seller.lastName}` },
  ]
  if (tx.buyer) recipients.push({ email: tx.buyer.email, name: `${tx.buyer.firstName} ${tx.buyer.lastName}` })
  if (tx.agentUser) recipients.push({ email: tx.agentUser.email, name: `${tx.agentUser.firstName} ${tx.agentUser.lastName}` })
  for (const conv of tx.conveyancerFirm?.users ?? []) {
    recipients.push({ email: conv.email, name: `${conv.firstName} ${conv.lastName}` })
  }

  for (const r of recipients) {
    sendEmail({
      to: r.email,
      event: 'BUYER_ACCEPTED_ALL_PARTIES',
      data: { ...emailData, recipientName: r.name },
    }).catch(() => {})
  }

  return NextResponse.json({ accepted: true })
})
