export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/email/crypto'
import { assertFirmMailboxManage, writeEmailAudit } from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'

const CreateMailboxSchema = z.object({
  displayName:   z.string().min(1).max(255),
  fromName:      z.string().min(1).max(255),
  fromAddress:   z.string().email(),
  smtpHost:      z.string().min(1).max(255),
  smtpPort:      z.coerce.number().int().min(1).max(65535),
  smtpUser:      z.string().min(1).max(255),
  smtpPass:      z.string().min(1),
  imapHost:      z.string().min(1).max(255),
  imapPort:      z.coerce.number().int().min(1).max(65535),
  imapUser:      z.string().min(1).max(255),
  imapPass:      z.string().min(1),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  const where =
    user.role === 'ADMIN'
      ? { isActive: true }
      : { firmId: user.firmId ?? '__none__', isActive: true }

  const mailboxes = await prisma.mailbox.findMany({
    where,
    select: {
      id: true,
      displayName: true,
      isActive: true,
      firmId: true,
      createdAt: true,
      credential: {
        select: { fromName: true, fromAddress: true, smtpHost: true, smtpPort: true, imapHost: true, imapPort: true },
      },
      _count: { select: { members: true, messages: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(mailboxes)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  try { await assertFirmMailboxManage(user) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const body = await req.json()
  const parsed = CreateMailboxSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const d = parsed.data
  const firmId = user.role === 'ADMIN' ? (body.firmId ?? user.firmId) : user.firmId
  if (!firmId) return NextResponse.json({ error: 'No firm associated with your account' }, { status: 422 })

  const mailbox = await prisma.mailbox.create({
    data: {
      displayName: d.displayName,
      firmId,
      credential: {
        create: {
          fromName: d.fromName,
          fromAddress: d.fromAddress,
          smtpHost: d.smtpHost,
          smtpPort: d.smtpPort,
          smtpUser: d.smtpUser,
          smtpPassEncrypted: encrypt(d.smtpPass),
          imapHost: d.imapHost,
          imapPort: d.imapPort,
          imapUser: d.imapUser,
          imapPassEncrypted: encrypt(d.imapPass),
        },
      },
      // Auto-add creator as member with send access
      members: {
        create: { userId: user.id, canSend: true },
      },
    },
    select: { id: true, displayName: true, firmId: true, createdAt: true },
  })

  await writeEmailAudit({
    mailboxId: mailbox.id,
    userId: user.id,
    eventType: 'MAILBOX_CREATED',
    eventData: { displayName: d.displayName, fromAddress: d.fromAddress },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined,
  })

  return NextResponse.json(mailbox, { status: 201 })
}
