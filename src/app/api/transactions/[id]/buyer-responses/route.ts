import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const ResponseSchema = z.object({
  itemId: z.string().uuid(),
  response: z.enum(['accept', 'reject', 'enquiry_raised']),
})

export const POST = withRBAC('buyer_form:read', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = ResponseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()

  const item = await prisma.fixturesItem.findFirst({
    where: { id: parsed.data.itemId, transactionId: params.id, deletedAt: null },
  })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const record = await prisma.buyerItemResponse.upsert({
    where: {
      transactionId_itemId_buyerUserId: {
        transactionId: params.id,
        itemId: parsed.data.itemId,
        buyerUserId: session!.user.id,
      },
    },
    update: { response: parsed.data.response, respondedAt: new Date() },
    create: {
      transactionId: params.id,
      itemId: parsed.data.itemId,
      buyerUserId: session!.user.id,
      response: parsed.data.response,
    },
  })

  await writeAuditLog({
    eventType: 'BUYER_ITEM_RESPONSE',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { itemId: parsed.data.itemId, response: parsed.data.response },
  })

  return NextResponse.json(record)
})

export const GET = withRBAC('buyer_form:read', async (_req, { params }) => {
  const session = await getServerSession()
  const responses = await prisma.buyerItemResponse.findMany({
    where: { transactionId: params.id, buyerUserId: session!.user.id },
  })
  return NextResponse.json(responses)
})
