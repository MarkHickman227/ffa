import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { RiskFlag } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const DismissSchema = z.object({
  reason: z.string().min(10).max(500),
})

export const PATCH = withRBAC('conveyancer:dismiss_risk', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = DismissSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()
  const item = await prisma.fixturesItem.findFirst({
    where: { id: params.itemId, transactionId: params.id, deletedAt: null },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.riskFlag === RiskFlag.NONE) {
    return NextResponse.json({ error: 'No active risk flag' }, { status: 409 })
  }

  const updated = await prisma.fixturesItem.update({
    where: { id: params.itemId },
    data: {
      riskFlagDismissedAt: new Date(),
      riskFlagDismissReason: parsed.data.reason,
    },
  })

  await writeAuditLog({
    eventType: 'RISK_FLAG_DISMISSED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { itemId: params.itemId, previousFlag: item.riskFlag, reason: parsed.data.reason },
  })

  return NextResponse.json(updated)
})
