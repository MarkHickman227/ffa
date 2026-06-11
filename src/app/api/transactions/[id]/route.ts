export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { assertMutable } from '@/lib/assertMutable'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { z } from 'zod'

// Zod v4 uuid() rejects non-standard version bits — use regex to accept all valid UUID shapes
const uuidRx = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i
const nullableUUID = z.preprocess(
  (v) => (v == null || v === '' ? null : v),
  z.string().regex(uuidRx).nullable().optional()
)

const PatchTransactionSchema = z.object({
  addressLine1:         z.string().min(1).max(255).optional(),
  addressLine2:         z.string().max(255).optional(),
  city:                 z.string().min(1).max(100).optional(),
  postcode:             z.string().min(1).max(10).optional(),
  conveyancerFirmId:    nullableUUID,
  conveyancerUserId:    nullableUUID,
  agentUserId:          nullableUUID,
  jobNumber:            z.string().max(100).nullable().optional(),
  contractId:           z.string().max(100).nullable().optional(),
  agentContactName:     z.string().max(200).nullable().optional(),
  agentPhone:           z.string().max(30).nullable().optional(),
  agentEmail:           z.string().email().nullable().optional(),
  buyerSolicitorName:   z.string().max(200).nullable().optional(),
  buyerSolicitorPhone:  z.string().max(30).nullable().optional(),
  buyerSolicitorEmail:  z.string().email().nullable().optional(),
  sellerContactAddress: z.string().nullable().optional(),
  buyerContactAddress:  z.string().nullable().optional(),
  valuationDate:        z.string().datetime().nullable().optional(),
  scheduledExchangeDate:z.string().datetime().nullable().optional(),
})

export const GET = withRBAC('transaction:read', async (_req, { params }) => {
  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      seller: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      buyer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      conveyancerUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      agentUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(tx)
})

// Edit transaction metadata + staff assignments — blocked once complete
export const PATCH = withRBAC('conveyancer:manage', async (req: NextRequest, { params }) => {
  const session = await getServerSession()
  const body = await req.json()
  const parsed = PatchTransactionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const guard = await assertMutable(params.id)
  if (guard) return guard

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: { property: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { addressLine1, addressLine2, city, postcode, ...txFields } = parsed.data

  // Validate staff role assignments if provided
  if (txFields.conveyancerUserId) {
    const u = await prisma.user.findUnique({ where: { id: txFields.conveyancerUserId }, select: { role: true } })
    if (!u || u.role !== 'CONVEYANCER') return NextResponse.json({ error: 'Invalid conveyancer' }, { status: 422 })
  }
  if (txFields.agentUserId) {
    const u = await prisma.user.findUnique({ where: { id: txFields.agentUserId }, select: { role: true } })
    if (!u || u.role !== 'AGENT') return NextResponse.json({ error: 'Invalid agent' }, { status: 422 })
  }
  await prisma.$transaction(async (db) => {
    // Update property address if any address field was supplied
    if (addressLine1 !== undefined || addressLine2 !== undefined || city !== undefined || postcode !== undefined) {
      await db.property.update({
        where: { id: tx.propertyId },
        data: {
          ...(addressLine1 !== undefined && { addressLine1 }),
          ...(addressLine2 !== undefined && { addressLine2 }),
          ...(city !== undefined && { city }),
          ...(postcode !== undefined && { postcode: postcode!.toUpperCase() }),
        },
      })
    }
    // Update transaction fields
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(txFields)) {
      if (v !== undefined) updateData[k] = v
    }
    if (Object.keys(updateData).length > 0) {
      await db.transaction.update({ where: { id: params.id }, data: updateData })
    }
  })

  await writeAuditLog({
    eventType: 'TRANSACTION_STATUS_CHANGED',
    transactionId: params.id,
    userId: (session?.user as any)?.id,
    eventData: { action: 'edited', fields: Object.keys(parsed.data) },
  })

  const updated = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: { property: true, seller: { select: { id: true, firstName: true, lastName: true, email: true } }, buyer: { select: { id: true, firstName: true, lastName: true, email: true } } },
  })
  return NextResponse.json(updated)
})

// Soft-delete a transaction — blocked once EXCHANGE_COMPLETE / ARCHIVED
export const DELETE = withRBAC('admin:all', async (_req, { params }) => {
  const session = await getServerSession()

  const guard = await assertMutable(params.id)
  if (guard) return guard

  await prisma.transaction.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  })

  await writeAuditLog({
    eventType: 'TRANSACTION_STATUS_CHANGED',
    transactionId: params.id,
    userId: (session?.user as any)?.id,
    eventData: { action: 'deleted', newStatus: 'ARCHIVED' },
  })

  return new NextResponse(null, { status: 204 })
})
