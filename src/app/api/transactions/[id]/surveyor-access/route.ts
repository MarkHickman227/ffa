import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { emitWebhookEvent } from '@/lib/webhooks'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const GrantSchema = z.object({
  surveyorUserId: z.string().uuid(),
})

const RevokeSchema = z.object({
  surveyorUserId: z.string().uuid(),
  action: z.literal('revoke'),
})

export const POST = withRBAC('surveyor_access:grant', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = GrantSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()

  const access = await prisma.surveyorAccess.create({
    data: {
      transactionId: params.id,
      surveyorUserId: parsed.data.surveyorUserId,
      grantedByUserId: session!.user.id,
    },
  })

  await writeAuditLog({
    eventType: 'SURVEYOR_ACCESS_GRANTED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { surveyorUserId: parsed.data.surveyorUserId },
  })
  await emitWebhookEvent('SURVEYOR_ACCESS_GRANTED', params.id, { surveyorUserId: parsed.data.surveyorUserId })

  return NextResponse.json(access, { status: 201 })
})

export const PATCH = withRBAC('surveyor_access:revoke', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = RevokeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()

  await prisma.surveyorAccess.updateMany({
    where: { transactionId: params.id, surveyorUserId: parsed.data.surveyorUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  await writeAuditLog({
    eventType: 'SURVEYOR_ACCESS_REVOKED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { surveyorUserId: parsed.data.surveyorUserId },
  })

  return NextResponse.json({ revoked: true })
})
