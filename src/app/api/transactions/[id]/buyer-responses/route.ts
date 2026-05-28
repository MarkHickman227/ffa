import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { assertMutable } from '@/lib/assertMutable'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'
import { RejectionReason } from '@prisma/client'

const ResponseSchema = z.object({
  itemId: z.string().uuid(),
  response: z.enum(['accept', 'reject', 'enquiry_raised']),
  // BR-016/017: rejection reason required when response is 'reject'
  rejectionReason: z.nativeEnum(RejectionReason).optional(),
}).refine(
  (d) => d.response !== 'reject' || d.rejectionReason != null,
  { message: 'rejectionReason is required when response is reject', path: ['rejectionReason'] },
)

export const POST = withRBAC('buyer_form:read', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = ResponseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const guard = await assertMutable(params.id)
  if (guard) return guard

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
    update: {
      response: parsed.data.response,
      rejectionReason: parsed.data.rejectionReason ?? null,
      respondedAt: new Date(),
    },
    create: {
      transactionId: params.id,
      itemId: parsed.data.itemId,
      buyerUserId: session!.user.id,
      response: parsed.data.response,
      rejectionReason: parsed.data.rejectionReason ?? null,
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
