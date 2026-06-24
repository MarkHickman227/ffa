import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { emitWebhookEvent } from '@/lib/webhooks'
import { sendEmail, buildItemsTable, type ItemRow } from '@/lib/email'
import { TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'
import { generateBuyerToken } from '@/lib/seller-access'

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
      agentUser: { select: { email: true, firstName: true, lastName: true } },
      conveyancerFirm: {
        include: {
          users: {
            where: { role: 'CONVEYANCER', deletedAt: null },
            select: { email: true },
          },
        },
      },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const editableStatuses: TransactionStatus[] = [
    TransactionStatus.SELLER_FORM_IN_PROGRESS,
    TransactionStatus.DRAFT,
    TransactionStatus.SELLER_REVISION,
  ]
  if (!editableStatuses.includes(tx.status)) {
    return NextResponse.json({ error: 'Form cannot be submitted in its current status' }, { status: 409 })
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
  const submittedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
  const isRevision = tx.status === TransactionStatus.SELLER_REVISION

  // Build items table for emails
  const dbItems = await prisma.fixturesItem.findMany({
    where: { transactionId: params.id, deletedAt: null, sortOrder: { gte: 0 } },
    orderBy: [{ room: 'asc' }, { sortOrder: 'asc' }],
  })
  const itemRows: ItemRow[] = dbItems.map(i => ({
    room: i.room,
    name: i.itemName,
    brand: i.make,
    type: i.itemType === 'FIXTURE' ? 'Fixture'
        : ['KITCHEN_APPLIANCE', 'BATHROOM_FITTING'].includes(i.itemType) ? 'Appliance'
        : 'Fitting',
    status: i.status === 'EXCLUDED' ? 'Excluded' : i.status === 'NEGOTIABLE' ? 'Negotiable' : 'Included',
    value: i.estimatedValue ? Number(i.estimatedValue) : null,
    notes: i.notes || null,
  }))
  const itemsTable = buildItemsTable(itemRows)

  if (isRevision) {
    // BR-014: notify conveyancer that revised form is ready for review
    const conveyancers = tx.conveyancerFirm?.users ?? []
    for (const conv of conveyancers) {
      sendEmail({
        to: conv.email,
        event: 'SELLER_REVISION_SUBMITTED',
        data: { address, reference: tx.reference, submittedAt },
      }).catch(() => {})
    }
  } else {
    // Initial submission — send full schedule to buyer and solicitors
    if (tx.buyer) {
      sendEmail({
        to: tx.buyer.email,
        event: 'BUYER_REVIEW_READY',
        data: {
          buyerName: `${tx.buyer.firstName} ${tx.buyer.lastName}`,
          address,
          reference: tx.reference,
          url: `${process.env.NEXTAUTH_URL}/buyer/${tx.id}?token=${generateBuyerToken(tx.id)}`,
          itemsTable,
        },
      }).catch(() => {})
    }

    const conveyancers = tx.conveyancerFirm?.users ?? []
    for (const conv of conveyancers) {
      sendEmail({
        to: conv.email,
        event: 'SELLER_FORM_SUBMITTED',
        data: { address, reference: tx.reference, submittedAt, itemsTable },
      }).catch(() => {})
    }

    if (tx.agentUser) {
      sendEmail({
        to: tx.agentUser.email,
        event: 'SELLER_PACK_SUBMITTED_AGENT',
        data: {
          agentName: `${tx.agentUser.firstName} ${tx.agentUser.lastName}`,
          address,
          reference: tx.reference,
          submittedAt,
        },
      }).catch(() => {})
    }
  }

  return NextResponse.json({ submitted: true })
})
