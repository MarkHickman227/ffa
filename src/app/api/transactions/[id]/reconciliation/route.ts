import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { emitWebhookEvent } from '@/lib/webhooks'
import { ReconciliationStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import Fuse from 'fuse.js'
import { getServerSession } from '@/lib/auth'

export const GET = withRBAC('agent:read', async (_req, { params }) => {
  const results = await prisma.marketingInclusion.findMany({
    where: { transactionId: params.id },
    select: { fixturesItemId: true, reconciliationStatus: true, conflictNote: true, reconciledAt: true },
  })
  return NextResponse.json({ results, conflictCount: results.filter((r) => r.reconciliationStatus === 'CONFLICT').length })
})

export const POST = withRBAC('agent:reconcile', async (req: NextRequest, { params }) => {
  const session = await getServerSession()

  const items = await prisma.fixturesItem.findMany({
    where: { transactionId: params.id, deletedAt: null },
    select: { id: true, description: true, room: true, status: true },
  })

  const marketingItems = await prisma.marketingInclusion.findMany({
    where: { transactionId: params.id },
  })

  // Fuzzy-match marketing descriptions against fixtures
  const fuse = new Fuse(items, { keys: ['description', 'room'], threshold: 0.35 })

  const results: Array<{
    fixturesItemId: string
    reconciliationStatus: ReconciliationStatus
    conflictNote?: string
  }> = []

  for (const mItem of marketingItems) {
    const fixture = items.find((i) => i.id === mItem.fixturesItemId)
    if (!fixture) {
      results.push({
        fixturesItemId: mItem.fixturesItemId,
        reconciliationStatus: ReconciliationStatus.UNMATCHED,
        conflictNote: 'Fixtures item not found',
      })
      continue
    }

    if (mItem.listedInMarketing && fixture.status === 'INCLUDED') {
      results.push({ fixturesItemId: mItem.fixturesItemId, reconciliationStatus: ReconciliationStatus.MATCHED })
    } else if (mItem.listedInMarketing && fixture.status === 'EXCLUDED') {
      results.push({
        fixturesItemId: mItem.fixturesItemId,
        reconciliationStatus: ReconciliationStatus.CONFLICT,
        conflictNote: `Item listed in marketing as included but marked ${fixture.status} in TA10`,
      })
    } else {
      results.push({ fixturesItemId: mItem.fixturesItemId, reconciliationStatus: ReconciliationStatus.MATCHED })
    }
  }

  // Persist results
  for (const result of results) {
    await prisma.marketingInclusion.updateMany({
      where: { transactionId: params.id, fixturesItemId: result.fixturesItemId },
      data: {
        reconciliationStatus: result.reconciliationStatus,
        conflictNote: result.conflictNote ?? null,
        reconciledAt: new Date(),
      },
    })
  }

  const conflicts = results.filter((r) => r.reconciliationStatus === ReconciliationStatus.CONFLICT)

  await writeAuditLog({
    eventType: 'RECONCILIATION_RUN',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { total: results.length, conflicts: conflicts.length },
  })

  if (conflicts.length > 0) {
    await emitWebhookEvent('RECONCILIATION_CONFLICT', params.id, { conflictCount: conflicts.length })
    await writeAuditLog({
      eventType: 'RECONCILIATION_CONFLICT_FLAGGED',
      transactionId: params.id,
      userId: session!.user.id,
      eventData: { conflicts: conflicts.map((c) => c.fixturesItemId) },
    })
  }

  return NextResponse.json({ results, conflictCount: conflicts.length })
})
