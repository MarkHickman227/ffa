import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { computeRiskFlag } from '@/lib/risk'
import { writeAuditLog } from '@/lib/audit'
import { ItemStatus, ItemType } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const CreateItemSchema = z.object({
  room: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  itemType: z.nativeEnum(ItemType),
  status: z.nativeEnum(ItemStatus).default(ItemStatus.INCLUDED),
  estimatedValue: z.number().nonnegative().optional(),
  notes: z.string().max(5000).optional(),
  photoUrls: z.array(z.string()).max(10).default([]),
  sortOrder: z.number().int().default(0),
})

export const GET = withRBAC('seller_form:read', async (_req, { params }) => {
  const items = await prisma.fixturesItem.findMany({
    where: { transactionId: params.id, deletedAt: null },
    orderBy: [{ room: 'asc' }, { sortOrder: 'asc' }],
  })
  return NextResponse.json(items)
})

export const POST = withRBAC('seller_form:write', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = CreateItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()
  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    select: { valuationDate: true, exchangedAt: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const riskFlag = computeRiskFlag({
    itemType: parsed.data.itemType,
    status: parsed.data.status,
    estimatedValue: parsed.data.estimatedValue,
    valuationDate: tx.valuationDate,
    exchangeDate: tx.exchangedAt,
  })

  const item = await prisma.$transaction(async (db) => {
    const created = await db.fixturesItem.create({
      data: {
        ...parsed.data,
        transactionId: params.id,
        riskFlag,
      },
    })
    await db.fixturesItemChangeLog.create({
      data: {
        fixturesItemId: created.id,
        transactionId: params.id,
        changedByUserId: session!.user.id,
        fieldName: 'created',
        oldValue: null,
        newValue: JSON.stringify(parsed.data),
      },
    })
    return created
  })

  await writeAuditLog({
    eventType: 'FIXTURES_ITEM_CREATED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { itemId: item.id, description: item.description },
  })

  return NextResponse.json(item, { status: 201 })
})
