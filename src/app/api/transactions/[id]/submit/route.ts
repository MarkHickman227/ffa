import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { emitWebhookEvent } from '@/lib/webhooks'
import { sendEmail } from '@/lib/email'
import { TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const SubmitSchema = z.object({
  ipAddress: z.string(),
  userAgent: z.string(),
  legalText: z.string().min(10),
  formVersion: z.string().default('1.0'),
})

const LEGAL_TEXT =
  'I confirm that the information provided in this TA10 Fixtures and Fittings form is accurate and complete to the best of my knowledge. I understand that this forms part of the legal contract for the sale of the property and that providing false information may constitute misrepresentation under the Misrepresentation Act 1967.'

export const POST = withRBAC('seller_form:submit', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      seller: true,
      buyer: true,
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (tx.status !== TransactionStatus.SELLER_FORM_IN_PROGRESS && tx.status !== TransactionStatus.DRAFT) {
    return NextResponse.json({ error: 'Form already submitted' }, { status: 409 })
  }

  await prisma.$transaction(async (db) => {
    await db.legalAcknowledgement.create({
      data: {
        transactionId: params.id,
        userId: session!.user.id,
        ipAddress: parsed.data.ipAddress,
        userAgent: parsed.data.userAgent,
        legalText: LEGAL_TEXT,
        formVersion: parsed.data.formVersion,
      },
    })

    await db.transaction.update({
      where: { id: params.id },
      data: {
        status: TransactionStatus.SELLER_FORM_SUBMITTED,
        sellerSubmittedAt: new Date(),
      },
    })
  })

  await writeAuditLog({
    eventType: 'SELLER_FORM_SUBMITTED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { formVersion: parsed.data.formVersion },
    ipAddress: parsed.data.ipAddress,
  })

  await emitWebhookEvent('SELLER_FORM_SUBMITTED', params.id, {
    sellerId: tx.sellerId,
    address: `${tx.property.addressLine1}, ${tx.property.postcode}`,
  })

  const address = `${tx.property.addressLine1}, ${tx.property.city} ${tx.property.postcode}`

  // Notify buyer (legally material — cannot opt out)
  if (tx.buyer) {
    await sendEmail({
      to: tx.buyer.email,
      event: 'BUYER_REVIEW_READY',
      data: {
        buyerName: `${tx.buyer.firstName} ${tx.buyer.lastName}`,
        address,
        reference: tx.reference,
        url: `${process.env.NEXTAUTH_URL}/buyer/${tx.id}`,
      },
    }).catch(() => {/* non-blocking */})
  }

  // Notify conveyancer (legally material)
  await sendEmail({
    to: tx.seller.email,
    event: 'SELLER_FORM_SUBMITTED',
    data: {
      address,
      reference: tx.reference,
      submittedAt: new Date().toISOString(),
    },
  }).catch(() => {/* non-blocking */})

  return NextResponse.json({ submitted: true })
})
