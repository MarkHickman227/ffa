import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { enqueuePdfExport } from '@/lib/webhooks'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

export const POST = withRBAC('conveyancer:export_pdf', async (_req: NextRequest, { params }) => {
  const session = await getServerSession()

  const tx = await prisma.transaction.findUnique({ where: { id: params.id } })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const jobId = await enqueuePdfExport(params.id, session!.user.id)

  await writeAuditLog({
    eventType: 'PDF_EXPORT_REQUESTED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { jobId },
  })

  return NextResponse.json({ jobId, status: 'queued' }, { status: 202 })
})
