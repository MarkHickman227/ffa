import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const ErasureSchema = z.object({
  userId: z.string().uuid(),
})

// Records that must be retained for legal compliance (immutable audit trail)
const RETAINED_RECORD_TYPES = [
  'LegalAcknowledgement',
  'BuyerAcceptance',
  'FixturesItemChangeLog',
  'AuditLog',
] as const

export const POST = withRBAC('gdpr:erasure', async (req: NextRequest) => {
  const body = await req.json()
  const parsed = ErasureSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()

  // Anonymise the user record (do not delete — foreign key references remain valid)
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      email: `erased-${parsed.data.userId}@gdpr.erased`,
      firstName: '[Erased]',
      lastName: '[Erased]',
      passwordHash: null,
      totpSecret: null,
      totpEnabled: false,
      deletedAt: new Date(),
    },
  })

  // Anonymise magic links
  await prisma.magicLink.deleteMany({ where: { userId: parsed.data.userId } })

  await writeAuditLog({
    eventType: 'ERASURE_REQUESTED',
    userId: session!.user.id,
    eventData: {
      targetUserId: parsed.data.userId,
      retained: RETAINED_RECORD_TYPES,
      erasedAt: new Date().toISOString(),
    },
  })

  return NextResponse.json({
    erased: true,
    retained: RETAINED_RECORD_TYPES,
    note: 'Immutable legal records (LegalAcknowledgement, BuyerAcceptance, FixturesItemChangeLog, AuditLog) are retained for 7 years per the Limitation Act 1980.',
  })
})
