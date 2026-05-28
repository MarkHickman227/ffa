import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { assertMutable } from '@/lib/assertMutable'
import { sendEmail } from '@/lib/email'
import { EnquiryStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'
import type { SessionUser } from '@/lib/rbac'
import { authOptions } from '@/lib/auth-options'
import { getServerSession as nextAuthSession } from 'next-auth'

const AnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
})

export const PATCH = async (req: NextRequest, { params }: { params: Record<string, string> }) => {
  const session = await nextAuthSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  const body = await req.json()

  const guard = await assertMutable(params.id)
  if (guard) return guard

  const enquiry = await prisma.enquiry.findFirst({
    where: { id: params.enquiryId, transactionId: params.id },
  })
  if (!enquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'close') {
    const allowed = await checkPermission(user, 'enquiry:close', params.id)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const updated = await prisma.enquiry.update({
      where: { id: params.enquiryId },
      data: { status: EnquiryStatus.CLOSED, closedAt: new Date() },
    })
    await writeAuditLog({
      eventType: 'ENQUIRY_CLOSED',
      transactionId: params.id,
      userId: user.id,
      eventData: { enquiryId: params.enquiryId },
    })
    return NextResponse.json(updated)
  }

  const allowed = await checkPermission(user, 'enquiry:answer', params.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = AnswerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: { buyer: true, property: true },
  })

  const updated = await prisma.enquiry.update({
    where: { id: params.enquiryId },
    data: {
      answer: parsed.data.answer,
      status: EnquiryStatus.ANSWERED,
      answeredAt: new Date(),
    },
  })

  await writeAuditLog({
    eventType: 'ENQUIRY_ANSWERED',
    transactionId: params.id,
    userId: user.id,
    eventData: { enquiryId: params.enquiryId },
  })

  if (tx?.buyer) {
    await sendEmail({
      to: tx.buyer.email,
      event: 'ENQUIRY_ANSWERED',
      data: { reference: tx.reference, answer: parsed.data.answer },
    }).catch(() => {/* non-blocking */})
  }

  return NextResponse.json(updated)
}
