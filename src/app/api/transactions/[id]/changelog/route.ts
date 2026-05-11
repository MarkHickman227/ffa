import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { NextRequest, NextResponse } from 'next/server'

export const GET = withRBAC('conveyancer:read', async (req: NextRequest, { params }) => {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const format = searchParams.get('format')

  const where: Record<string, unknown> = { transactionId: params.id }
  if (itemId) where.fixturesItemId = itemId
  if (from || to) {
    where.changedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const logs = await prisma.fixturesItemChangeLog.findMany({
    where,
    orderBy: { changedAt: 'desc' },
    take: 500,
  })

  if (format === 'csv') {
    const header = 'id,fixturesItemId,fieldName,oldValue,newValue,changedByUserId,changedAt\n'
    const rows = logs
      .map((l) =>
        [l.id, l.fixturesItemId, l.fieldName, l.oldValue ?? '', l.newValue ?? '', l.changedByUserId, l.changedAt.toISOString()].join(','),
      )
      .join('\n')
    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="changelog-${params.id}.csv"`,
      },
    })
  }

  return NextResponse.json(logs)
})
