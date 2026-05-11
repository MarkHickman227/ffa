import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { EnquiryStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const AnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
})

const CloseSchema = z.object({
  action: z.literal('close'),
})

export const PATCH = withRBAC('enquiry:answer', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const session = await getServerSession()

  const enquiry = await prisma.enquiry.findFirst({
    where: { id: params.enquiryId, transactionId: params.id },
  })
  if (!enquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'close') {
    const updated = await prisma.enquiry.update({
      where: { id: params.enquiryId },
      data: { status: EnquiryStatus.CLOSED, closedAt: new Date() },
    })
    await writeAuditLog({
      eventType: 'ENQUIRY_CLOSED',
      transactionId: params.id,
      userId: session!.user.id,
      eventData: { enquiryId: params.enquiryId },
    })
    return NextResponse.json(updated)
  }

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
    userId: session!.user.id,
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
})
