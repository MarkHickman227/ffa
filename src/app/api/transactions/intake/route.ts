export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { getServerSession } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const optStr = (max: number) => z.string().max(max).optional().nullable()
const optEmail = z.union([z.string().email(), z.literal('')]).optional().transform((v) => v || null)

const IntakeSchema = z.object({
  jobNumber:            z.string().min(1).max(100),
  contractId:           optStr(100),
  // Selling property address
  addressLine1:         z.string().min(1).max(255),
  addressLine2:         optStr(255),
  city:                 z.string().min(1).max(100),
  postcode:             z.string().min(1).max(10),
  // Seller
  sellerFirstName:      z.string().min(1).max(100),
  sellerLastName:       z.string().min(1).max(100),
  sellerEmail:          z.string().email(),
  sellerPhone:          optStr(30),
  sellerContactAddress: optStr(1000),
  // Estate agent
  agentContactName:     optStr(200),
  agentPhone:           optStr(30),
  agentEmail:           optEmail,
  // Buyer's solicitor
  buyerSolicitorName:   optStr(200),
  buyerSolicitorPhone:  optStr(30),
  buyerSolicitorEmail:  optEmail,
  // Buyer
  buyerFirstName:       optStr(100),
  buyerLastName:        optStr(100),
  buyerEmail:           optEmail,
  buyerPhone:           optStr(30),
  buyerContactAddress:  optStr(1000),
})

export const POST = withRBAC('transaction:create', async (req: NextRequest) => {
  const session = await getServerSession()
  const body = await req.json()
  const parsed = IntakeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const d = parsed.data
  const user = session!.user as any

  // Enforce unique job number
  const duplicate = await prisma.transaction.findFirst({ where: { jobNumber: d.jobNumber } })
  if (duplicate) {
    return NextResponse.json({ error: `Job number "${d.jobNumber}" is already in use` }, { status: 409 })
  }

  // Auto-generate FFA reference
  const year = new Date().getFullYear()
  const count = await prisma.transaction.count({ where: { reference: { startsWith: `FFA-${year}-` } } })
  const reference = `FFA-${year}-${String(count + 1).padStart(4, '0')}`

  // Upsert seller
  const seller = await prisma.user.upsert({
    where: { email_role: { email: d.sellerEmail.toLowerCase(), role: 'SELLER' } },
    create: {
      email: d.sellerEmail.toLowerCase(),
      firstName: d.sellerFirstName,
      lastName: d.sellerLastName,
      role: 'SELLER',
      phone: d.sellerPhone ?? null,
    },
    update: {
      firstName: d.sellerFirstName,
      lastName: d.sellerLastName,
      phone: d.sellerPhone ?? undefined,
    },
  })

  // Upsert buyer if all key fields provided
  let buyer = null
  if (d.buyerFirstName && d.buyerLastName && d.buyerEmail) {
    buyer = await prisma.user.upsert({
      where: { email_role: { email: d.buyerEmail.toLowerCase(), role: 'BUYER' } },
      create: {
        email: d.buyerEmail.toLowerCase(),
        firstName: d.buyerFirstName,
        lastName: d.buyerLastName,
        role: 'BUYER',
        phone: d.buyerPhone ?? null,
      },
      update: {
        firstName: d.buyerFirstName,
        lastName: d.buyerLastName,
        phone: d.buyerPhone ?? undefined,
      },
    })
  }

  // Create property (selling address)
  const property = await prisma.property.create({
    data: {
      addressLine1: d.addressLine1,
      addressLine2: d.addressLine2 ?? undefined,
      city: d.city,
      postcode: d.postcode.toUpperCase(),
    },
  })

  // Create transaction
  const tx = await prisma.transaction.create({
    data: {
      reference,
      jobNumber:            d.jobNumber,
      contractId:           d.contractId ?? null,
      status:               'DRAFT',
      propertyId:           property.id,
      sellerId:             seller.id,
      buyerId:              buyer?.id ?? null,
      conveyancerFirmId:    user.firmId ?? null,
      sellerContactAddress: d.sellerContactAddress ?? null,
      agentContactName:     d.agentContactName ?? null,
      agentPhone:           d.agentPhone ?? null,
      agentEmail:           d.agentEmail ?? null,
      buyerSolicitorName:   d.buyerSolicitorName ?? null,
      buyerSolicitorPhone:  d.buyerSolicitorPhone ?? null,
      buyerSolicitorEmail:  d.buyerSolicitorEmail ?? null,
      buyerContactAddress:  d.buyerContactAddress ?? null,
    },
  })

  await writeAuditLog({
    eventType: 'TRANSACTION_CREATED',
    transactionId: tx.id,
    userId: session!.user.id,
    eventData: { reference, jobNumber: d.jobNumber, sellerEmail: d.sellerEmail },
  })

  const address = [d.addressLine1, d.city, d.postcode.toUpperCase()].filter(Boolean).join(', ')
  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
  sendEmail({
    to: seller.email,
    event: 'SELLER_FORM_INVITE',
    data: {
      sellerName: `${seller.firstName} ${seller.lastName}`,
      address,
      reference,
      url: `${appUrl}/seller/${tx.id}`,
    },
  }).catch(() => {})

  return NextResponse.json(tx, { status: 201 })
})
