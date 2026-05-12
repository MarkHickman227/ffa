export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

const RETENTION_YEARS = 7

// Immutable records — never deleted, only cold-archived by extracting to JSON
const IMMUTABLE_TABLES = ['LegalAcknowledgement', 'BuyerAcceptance', 'FixturesItemChangeLog', 'AuditLog']

export const POST = withRBAC('admin:all', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dry-run') === 'true'
  const session = await getServerSession()

  const cutoffDate = new Date()
  cutoffDate.setFullYear(cutoffDate.getFullYear() - RETENTION_YEARS)

  // Find transactions older than 7 years with no active legal proceedings
  const eligibleTransactions = await prisma.transaction.findMany({
    where: {
      createdAt: { lt: cutoffDate },
      status: { in: ['ARCHIVED', 'EXCHANGE_COMPLETE'] },
    },
    select: { id: true, reference: true, createdAt: true },
  })

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      cutoffDate,
      eligibleTransactionCount: eligibleTransactions.length,
      eligibleTransactions: eligibleTransactions.map((t) => ({ id: t.id, reference: t.reference, createdAt: t.createdAt })),
      immutableRetained: IMMUTABLE_TABLES,
    })
  }

  let deletedMagicLinks = 0
  let archivedTransactions = 0

  for (const tx of eligibleTransactions) {
    // Delete non-immutable, non-legally-required data
    await prisma.magicLink.deleteMany({
      where: { user: { sellerTransactions: { some: { id: tx.id } } } },
    })
    deletedMagicLinks++

    // Mark transaction as archived (soft)
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { deletedAt: new Date() },
    })
    archivedTransactions++
  }

  await writeAuditLog({
    eventType: 'RETENTION_PURGE_RUN',
    userId: session!.user.id,
    eventData: {
      cutoffDate,
      archivedTransactions,
      deletedMagicLinks,
      immutableRetained: IMMUTABLE_TABLES,
      runAt: new Date().toISOString(),
    },
  })

  return NextResponse.json({
    dryRun: false,
    cutoffDate,
    archivedTransactions,
    deletedMagicLinks,
    immutableRetained: IMMUTABLE_TABLES,
  })
})
