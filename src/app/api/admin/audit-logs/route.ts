export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { NextRequest, NextResponse } from 'next/server'

export const GET = withRBAC('audit_log:read', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const transactionId = searchParams.get('transactionId')
  const userId = searchParams.get('userId')
  const eventType = searchParams.get('eventType')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const cursor = searchParams.get('cursor')
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)

  const where: Record<string, unknown> = {}
  if (transactionId) where.transactionId = transactionId
  if (userId) where.userId = userId
  if (eventType) where.eventType = eventType
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = logs.length > limit
  const page = hasMore ? logs.slice(0, -1) : logs

  return NextResponse.json({
    data: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  })
})
