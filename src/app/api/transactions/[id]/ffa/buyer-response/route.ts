import { prisma } from '@/lib/prisma'
import { withRBAC, SessionUser } from '@/lib/rbac'
import { ffaBuyerResponse, type FfaBuyerResponseItem } from '@/lib/ffa-api'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { NextRequest, NextResponse } from 'next/server'

export const POST = withRBAC('buyer_form:accept', async (req: NextRequest, { params }) => {
  const session = await getServerSession(authOptions)
  const user = session!.user as SessionUser

  const body = await req.json()
  const { responses } = body as { responses?: FfaBuyerResponseItem[] }

  if (!Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json({ error: 'responses array required' }, { status: 400 })
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { ffaSubmissionId: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let ffaError: string | null = null

  // Forward to external API (non-fatal)
  if (tx.ffaSubmissionId) {
    try {
      await ffaBuyerResponse(tx.ffaSubmissionId, responses)
    } catch (err) {
      ffaError = err instanceof Error ? err.message : 'buyer-response failed'
    }
  }

  // Write-through to Prisma BuyerItemResponse
  const now = new Date()
  let written = 0
  for (const r of responses) {
    const item = await prisma.fixturesItem.findFirst({
      where: { transactionId: params.id, itemName: r.item_name, deletedAt: null },
    })
    if (!item) continue

    const responseStr =
      r.response === 'accept' ? 'accept' : r.response === 'reject' ? 'reject' : 'counter'

    await prisma.buyerItemResponse.upsert({
      where: {
        transactionId_itemId_buyerUserId: {
          transactionId: params.id,
          itemId: item.id,
          buyerUserId: user.id,
        },
      },
      create: {
        transactionId: params.id,
        itemId: item.id,
        buyerUserId: user.id,
        response: responseStr,
        respondedAt: now,
      },
      update: {
        response: responseStr,
        respondedAt: now,
      },
    })
    written++
  }

  return NextResponse.json({
    ok: true,
    written,
    ...(ffaError ? { ffaError } : {}),
  })
})
