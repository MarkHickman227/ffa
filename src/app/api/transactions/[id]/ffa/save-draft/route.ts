import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { NextRequest, NextResponse } from 'next/server'
import { ItemType, ItemStatus } from '@prisma/client'

interface DraftItem {
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

export const POST = withRBAC('seller_form:write', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const { items } = body as { items?: DraftItem[] }

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items required' }, { status: 400 })
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['EXCHANGE_COMPLETE', 'ARCHIVED'].includes(tx.status)) {
    return NextResponse.json({ error: 'Transaction is locked' }, { status: 409 })
  }

  await prisma.$transaction([
    // Only remove in-progress draft items (negative sortOrder); leave submitted items untouched
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
        sortOrder: -(i + 1),  // negative = in-progress draft, not yet submitted
      })),
    }),
  ])

  return NextResponse.json({ saved: true, count: items.length })
})
