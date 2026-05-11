import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { computeRiskFlag } from '@/lib/risk'
import { writeAuditLog } from '@/lib/audit'
import { ItemStatus, ItemType } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const PatchItemSchema = z.object({
  room: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  itemType: z.nativeEnum(ItemType).optional(),
  status: z.nativeEnum(ItemStatus).optional(),
  estimatedValue: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  photoUrls: z.array(z.string()).max(10).optional(),
  sortOrder: z.number().int().optional(),
})

export const PATCH = withRBAC('seller_form:write', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = PatchItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()
  const existing = await prisma.fixturesItem.findFirst({
    where: { id: params.itemId, transactionId: params.id, deletedAt: null },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    select: { valuationDate: true, exchangedAt: true },
  })

  const updatedType = parsed.data.itemType ?? existing.itemType
  const updatedStatus = parsed.data.status ?? existing.status
  const updatedValue = parsed.data.estimatedValue ?? Number(existing.estimatedValue)

  const riskFlag = computeRiskFlag({
    itemType: updatedType,
    status: updatedStatus,
    estimatedValue: updatedValue,
    valuationDate: tx?.valuationDate,
    exchangeDate: tx?.exchangedAt,
    previousStatus: existing.status,
  })

  const updated = await prisma.$transaction(async (db) => {
    const item = await db.fixturesItem.update({
      where: { id: params.itemId },
      data: { ...parsed.data, riskFlag },
    })

    // Record each changed field in the change log (immutable)
    const changeEntries = Object.entries(parsed.data)
      .filter(([k]) => existing[k as keyof typeof existing] !== parsed.data[k as keyof typeof parsed.data])
      .map(([field, newVal]) => ({
        fixturesItemId: params.itemId,
        transactionId: params.id,
        changedByUserId: session!.user.id,
        fieldName: field,
        oldValue: String(existing[field as keyof typeof existing] ?? ''),
        newValue: String(newVal ?? ''),
      }))

    if (changeEntries.length > 0) {
      await db.fixturesItemChangeLog.createMany({ data: changeEntries })
    }

    return item
  })

  await writeAuditLog({
    eventType: 'FIXTURES_ITEM_UPDATED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { itemId: params.itemId, changes: Object.keys(parsed.data) },
  })

  return NextResponse.json(updated)
})

export const DELETE = withRBAC('seller_form:write', async (_req, { params }) => {
  const session = await getServerSession()
  const existing = await prisma.fixturesItem.findFirst({
    where: { id: params.itemId, transactionId: params.id, deletedAt: null },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction(async (db) => {
    await db.fixturesItem.update({
      where: { id: params.itemId },
      data: { deletedAt: new Date() },
    })
    await db.fixturesItemChangeLog.create({
      data: {
        fixturesItemId: params.itemId,
        transactionId: params.id,
        changedByUserId: session!.user.id,
        fieldName: 'deletedAt',
        oldValue: null,
        newValue: new Date().toISOString(),
      },
    })
  })

  await writeAuditLog({
    eventType: 'FIXTURES_ITEM_DELETED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { itemId: params.itemId },
  })

  return new NextResponse(null, { status: 204 })
})
