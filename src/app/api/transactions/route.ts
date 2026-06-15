export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { sendSellerFormInvite } from '@/lib/seller-invite'
import { getServerSession } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Zod v4 uuid() is strict about version bits — use regex for DB-originated UUIDs
const uuidRx = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i
const optUUID = z.preprocess(
  (v) => (v == null || v === '' ? undefined : v),
  z.string().regex(uuidRx).optional()
)

const CreateTransactionSchema = z.object({
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  postcode: z.string().min(1).max(10),
  sellerUserId: optUUID,
  sellerEmail: z.string().email(),
  sellerFirstName: z.string().min(1).max(100),
  sellerLastName: z.string().min(1).max(100),
  sellerPhone: z.string().max(30).optional(),
  // BR-001: buyer required
  buyerUserId: optUUID,
  buyerEmail: z.string().email(),
  buyerFirstName: z.string().min(1).max(100),
  buyerLastName: z.string().min(1).max(100),
  buyerPhone: z.string().max(30).optional(),
  conveyancerFirmId: optUUID,
  conveyancerUserId: optUUID,
  agentUserId: optUUID,
  buyerSolicitorUserId: optUUID,
})

export const POST = withRBAC('transaction:create', async (req: NextRequest) => {
  const session = await getServerSession()
  const body = await req.json()
  const parsed = CreateTransactionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const user = session!.user as any
  const { sellerUserId, buyerUserId, conveyancerUserId, agentUserId, buyerSolicitorUserId } = parsed.data

  if (conveyancerUserId) {
    const u = await prisma.user.findUnique({ where: { id: conveyancerUserId }, select: { role: true } })
    if (!u || u.role !== 'CONVEYANCER') return NextResponse.json({ error: 'Invalid conveyancer' }, { status: 422 })
  }

  // Fetch agent user with contact details for auto-population
  let agentUser: { role: string; firstName: string; lastName: string; email: string; phone: string | null } | null = null
  if (agentUserId) {
    agentUser = await prisma.user.findUnique({ where: { id: agentUserId }, select: { role: true, firstName: true, lastName: true, email: true, phone: true } })
    if (!agentUser || agentUser.role !== 'AGENT') return NextResponse.json({ error: 'Invalid agent' }, { status: 422 })
  }

  // Fetch buyer solicitor user with contact details for auto-population
  let solicitorUser: { role: string; firstName: string; lastName: string; email: string; phone: string | null } | null = null
  if (buyerSolicitorUserId) {
    solicitorUser = await prisma.user.findUnique({ where: { id: buyerSolicitorUserId }, select: { role: true, firstName: true, lastName: true, email: true, phone: true } })
    if (!solicitorUser || solicitorUser.role !== 'BUYER_SOLICITOR') return NextResponse.json({ error: 'Invalid buyer solicitor' }, { status: 422 })
  }

  const year = new Date().getFullYear()
  const count = await prisma.transaction.count({ where: { reference: { startsWith: `FFA-${year}-` } } })
  const reference = `FFA-${year}-${String(count + 1).padStart(4, '0')}`

  const { sellerEmail, sellerFirstName, sellerLastName, sellerPhone, buyerEmail, buyerFirstName, buyerLastName, buyerPhone } = parsed.data

  // If an existing user ID was supplied, use it directly; otherwise upsert by email
  let seller: { id: string; email: string; firstName: string; lastName: string }
  if (sellerUserId) {
    const existing = await prisma.user.findUnique({ where: { id: sellerUserId }, select: { id: true, email: true, firstName: true, lastName: true } })
    if (!existing) return NextResponse.json({ error: 'Seller user not found' }, { status: 422 })
    seller = existing
  } else {
    seller = await prisma.user.upsert({
      where: { email_role: { email: sellerEmail.toLowerCase(), role: 'SELLER' } },
      create: { email: sellerEmail.toLowerCase(), firstName: sellerFirstName, lastName: sellerLastName, role: 'SELLER', phone: sellerPhone ?? null },
      update: { phone: sellerPhone ?? undefined },
    })
  }

  let buyer: { id: string; email: string; firstName: string; lastName: string }
  if (buyerUserId) {
    const existing = await prisma.user.findUnique({ where: { id: buyerUserId }, select: { id: true, email: true, firstName: true, lastName: true } })
    if (!existing) return NextResponse.json({ error: 'Buyer user not found' }, { status: 422 })
    buyer = existing
  } else {
    buyer = await prisma.user.upsert({
      where: { email_role: { email: buyerEmail.toLowerCase(), role: 'BUYER' } },
      create: { email: buyerEmail.toLowerCase(), firstName: buyerFirstName, lastName: buyerLastName, role: 'BUYER', phone: buyerPhone ?? null },
      update: { phone: buyerPhone ?? undefined },
    })
  }

  const property = await prisma.property.create({
    data: {
      addressLine1: parsed.data.addressLine1,
      addressLine2: parsed.data.addressLine2,
      city: parsed.data.city,
      postcode: parsed.data.postcode.toUpperCase(),
    },
  })

  const firmId = parsed.data.conveyancerFirmId ?? user.firmId ?? null

  const tx = await prisma.transaction.create({
    data: {
      reference,
      status: 'SELLER_FORM_IN_PROGRESS',
      propertyId: property.id,
      sellerId: seller.id,
      buyerId: buyer.id,
      conveyancerFirmId: firmId,
      conveyancerUserId: conveyancerUserId ?? null,
      agentUserId: agentUserId ?? null,
      // Auto-populate agent contact details from agent user record
      ...(agentUser && {
        agentContactName: `${agentUser.firstName} ${agentUser.lastName}`,
        agentEmail: agentUser.email,
        agentPhone: agentUser.phone ?? null,
      }),
      // Auto-populate buyer solicitor details from solicitor user record
      ...(solicitorUser && {
        buyerSolicitorName: `${solicitorUser.firstName} ${solicitorUser.lastName}`,
        buyerSolicitorEmail: solicitorUser.email,
        buyerSolicitorPhone: solicitorUser.phone ?? null,
      }),
    },
  })

  const address = `${property.addressLine1}, ${property.city} ${property.postcode}`

  // Fire all notification emails simultaneously
  Promise.allSettled([
    // BR-002: seller receives a magic-link that signs them in and opens their form directly
    sendSellerFormInvite({
      sellerEmail: seller.email,
      sellerName: `${seller.firstName} ${seller.lastName}`,
      transactionId: tx.id,
      reference,
      address,
    }),
    // Estate agent notification
    ...(agentUser ? [sendEmail({
      to: agentUser.email,
      event: 'TRANSACTION_ASSIGNED_AGENT',
      data: { agentName: `${agentUser.firstName} ${agentUser.lastName}`, address, reference },
    })] : []),
    // Buyer's solicitor notification
    ...(solicitorUser ? [sendEmail({
      to: solicitorUser.email,
      event: 'TRANSACTION_ASSIGNED_SOLICITOR',
      data: { solicitorName: `${solicitorUser.firstName} ${solicitorUser.lastName}`, address, reference },
    })] : []),
  ]).catch(() => {})

  writeAuditLog({
    eventType: 'TRANSACTION_CREATED',
    transactionId: tx.id,
    userId: user.id,
    eventData: { reference, sellerEmail, buyerEmail, conveyancerUserId, agentUserId, buyerSolicitorUserId },
  }).catch(() => {})

  return NextResponse.json({ ...tx, reference, sellerId: seller.id }, { status: 201 })
})
