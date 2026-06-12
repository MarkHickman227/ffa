export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { assertMailboxSendAccess, writeEmailAudit } from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const SendSchema = z.object({
  mailboxId:  z.string().uuid(),
  threadId:   z.string().uuid().optional(),
  inReplyTo:  z.string().max(500).optional(),
  to:         z.array(z.string().email()).min(1),
  cc:         z.array(z.string().email()).default([]),
  subject:    z.string().min(1).max(500),
  bodyText:   z.string().optional(),
  bodyHtml:   z.string().optional(),
})

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
const sendQueue = new Queue('email-send', { connection })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  const body = await req.json()
  const parsed = SendSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const d = parsed.data

  try { await assertMailboxSendAccess(user, d.mailboxId) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const cred = await prisma.mailboxCredential.findUnique({
    where: { mailboxId: d.mailboxId },
    select: { fromName: true, fromAddress: true },
  })
  if (!cred) return NextResponse.json({ error: 'Mailbox not configured' }, { status: 422 })

  const queued = await prisma.outboundQueue.create({
    data: {
      mailboxId:   d.mailboxId,
      threadId:    d.threadId ?? null,
      inReplyTo:   d.inReplyTo ?? null,
      fromAddress: cred.fromAddress,
      fromName:    cred.fromName,
      toAddresses: d.to,
      ccAddresses: d.cc,
      subject:     d.subject,
      bodyText:    d.bodyText ?? null,
      bodyHtml:    d.bodyHtml ?? null,
      status:      'PENDING',
    },
    select: { id: true },
  })

  await sendQueue.add('send', { outboundId: queued.id }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })

  await writeEmailAudit({
    mailboxId: d.mailboxId,
    userId: user.id,
    eventType: 'EMAIL_QUEUED',
    eventData: { to: d.to, subject: d.subject, outboundId: queued.id },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined,
  })

  return NextResponse.json({ queued: true, id: queued.id }, { status: 202 })
}
