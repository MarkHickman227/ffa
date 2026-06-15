import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { sendEmail } from '@/lib/email'
import { writeAuditLog } from '@/lib/audit'
import { getServerSession } from '@/lib/auth'
import { ffaSubmitForm, itemTypeToSdlt, prismaStatusToFfa, type FfaItem } from '@/lib/ffa-api'
import { NextRequest, NextResponse } from 'next/server'
import { ItemType, ItemStatus, TransactionStatus } from '@prisma/client'

interface SubmitItem {
  room: string
  title: string
  brand: string
  price: number | null
  sdlt: 'low' | 'medium' | 'high'
  notes: string
  status: 'include' | 'exclude' | 'negotiate'
  imgData: string | null
}

function toItemType(sdlt: string): ItemType {
  if (sdlt === 'high')   return ItemType.FIXTURE
  if (sdlt === 'medium') return ItemType.KITCHEN_APPLIANCE
  return ItemType.FITTING
}

function toItemStatus(s: string): ItemStatus {
  if (s === 'exclude')   return ItemStatus.EXCLUDED
  if (s === 'negotiate') return ItemStatus.NEGOTIABLE
  return ItemStatus.INCLUDED
}

export const POST = withRBAC('seller_form:submit', async (req: NextRequest, { params }) => {
  const session = await getServerSession()
  const userId = (session?.user as any)?.id as string | undefined

  const body = await req.json()
  const { items, property_reference } = body as { items?: SubmitItem[]; property_reference?: string }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items required' }, { status: 400 })
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      property: true,
      seller: { select: { firstName: true, lastName: true, email: true } },
      buyer: { select: { firstName: true, lastName: true, email: true } },
      conveyancerUser: { select: { firstName: true, lastName: true, email: true } },
      agentUser: { select: { firstName: true, lastName: true, email: true } },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['EXCHANGE_COMPLETE', 'ARCHIVED'].includes(tx.status)) {
    return NextResponse.json({ error: 'Transaction is locked' }, { status: 409 })
  }

  const address = [tx.property.addressLine1, tx.property.city, tx.property.postcode].filter(Boolean).join(', ')
  const submittedAt = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'

  // Add new items; clear in-progress drafts (negative sortOrder); keep previous submissions
  await prisma.$transaction([
    prisma.fixturesItem.deleteMany({ where: { transactionId: params.id, sortOrder: { lt: 0 } } }),
    prisma.fixturesItem.createMany({
      data: items.map((item, i) => ({
        transactionId: params.id,
        room: item.room,
        itemName: item.title || 'Unnamed item',
        description: item.notes || '',
        itemType: toItemType(item.sdlt),
        status: toItemStatus(item.status),
        estimatedValue: item.price ?? undefined,
        make: item.brand || null,
        model: null,
        notes: item.notes || '',
        photoUrls: item.imgData ? [item.imgData] : [],
        sortOrder: i,
      })),
    }),
  ])

  // Update transaction status
  await prisma.transaction.update({
    where: { id: params.id },
    data: {
      status: TransactionStatus.SELLER_FORM_SUBMITTED,
      sellerSubmittedAt: new Date(),
      ...(property_reference?.trim() ? {} : {}),
    },
  })

  // Send email to buyer
  if (tx.buyer?.email) {
    sendEmail({
      to: tx.buyer.email,
      event: 'BUYER_REVIEW_READY',
      data: {
        buyerName: `${tx.buyer.firstName} ${tx.buyer.lastName}`,
        address,
        reference: tx.reference,
        url: `${appUrl}/buyer/${tx.id}`,
      },
    }).catch(() => {})
  }

  // Send email to conveyancer/solicitor
  const solicitorEmail = tx.conveyancerUser?.email ?? (tx as any).buyerSolicitorEmail
  const solicitorName  = tx.conveyancerUser
    ? `${tx.conveyancerUser.firstName} ${tx.conveyancerUser.lastName}`
    : (tx as any).buyerSolicitorName ?? 'Solicitor'
  if (solicitorEmail) {
    sendEmail({
      to: solicitorEmail,
      event: 'SELLER_FORM_SUBMITTED',
      data: { address, reference: tx.reference, submittedAt },
    }).catch(() => {})
  }

  // Send email to estate agent
  const agentEmail = tx.agentUser?.email ?? (tx as any).agentEmail
  const agentName  = tx.agentUser
    ? `${tx.agentUser.firstName} ${tx.agentUser.lastName}`
    : (tx as any).agentContactName ?? 'Agent'
  if (agentEmail) {
    sendEmail({
      to: agentEmail,
      event: 'SELLER_PACK_SUBMITTED_AGENT',
      data: { agentName, address, reference: tx.reference, submittedAt },
    }).catch(() => {})
  }

  writeAuditLog({
    eventType: 'TRANSACTION_STATUS_CHANGED',
    transactionId: params.id,
    userId,
    eventData: { action: 'seller_submitted', itemCount: items.length },
  }).catch(() => {})

  // Submit ALL items (previous + new) to Flask FFA API
  try {
    const allItems = await prisma.fixturesItem.findMany({
      where: { transactionId: params.id, deletedAt: null, sortOrder: { gte: 0 } },
      orderBy: [{ room: 'asc' }, { sortOrder: 'asc' }],
    })
    const ffaItems: FfaItem[] = allItems.map(item => ({
      item_name:        item.itemName,
      brand:            item.make ?? '',
      model:            item.model ?? '',
      estimated_value:  item.estimatedValue ? Number(item.estimatedValue) : null,
      sdlt_sensitivity: itemTypeToSdlt(item.itemType),
      notes:            item.notes ?? '',
      status:           prismaStatusToFfa(item.status),
      room:             item.room,
      ...(item.photoUrls[0]?.startsWith('data:') ? { image: item.photoUrls[0].split(',')[1] } : {}),
    }))
    const { submission_id } = await ffaSubmitForm(address, ffaItems)
    await prisma.transaction.update({
      where: { id: params.id },
      data: { ffaSubmissionId: submission_id },
    })
  } catch (ffaErr) {
    console.error('[seller-submit] FFA submit failed:', ffaErr)
    // Non-fatal: buyer form falls back to Prisma fixtures
  }

  return NextResponse.json({ submitted: true, item_count: items.length })
})
