import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { EnquiryRouting } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const CreateEnquirySchema = z.object({
  question: z.string().min(1).max(2000),
  fixturesItemId: z.string().uuid().optional(),
  routing: z.nativeEnum(EnquiryRouting).optional(),
})

export const GET = withRBAC('buyer_form:read', async (_req, { params }) => {
  const enquiries = await prisma.enquiry.findMany({
    where: { transactionId: params.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(enquiries)
})

export const POST = withRBAC('enquiry:raise', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const parsed = CreateEnquirySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const session = await getServerSession()
  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: { seller: true, property: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const enquiry = await prisma.enquiry.create({
    data: {
      transactionId: params.id,
      raisedByUserId: session!.user.id,
      fixturesItemId: parsed.data.fixturesItemId ?? null,
      question: parsed.data.question,
      routing: parsed.data.routing ?? EnquiryRouting.SELLER_CONVEYANCER,
    },
  })

  await writeAuditLog({
    eventType: 'ENQUIRY_RAISED',
    transactionId: params.id,
    userId: session!.user.id,
    eventData: { enquiryId: enquiry.id, routing: enquiry.routing },
  })

  await sendEmail({
    to: tx.seller.email,
    event: 'ENQUIRY_RAISED',
    data: { reference: tx.reference, question: parsed.data.question },
  }).catch(() => {/* non-blocking */})

  return NextResponse.json(enquiry, { status: 201 })
})
