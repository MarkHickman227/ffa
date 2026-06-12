export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/email/crypto'
import {
  assertMailboxAccess,
  assertFirmMailboxManage,
  writeEmailAudit,
} from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'

const UpdateSchema = z.object({
  displayName:  z.string().min(1).max(255).optional(),
  fromName:     z.string().min(1).max(255).optional(),
  fromAddress:  z.string().email().optional(),
  smtpHost:     z.string().min(1).max(255).optional(),
  smtpPort:     z.coerce.number().int().min(1).max(65535).optional(),
  smtpUser:     z.string().min(1).max(255).optional(),
  smtpPass:     z.string().min(1).optional(),
  imapHost:     z.string().min(1).max(255).optional(),
  imapPort:     z.coerce.number().int().min(1).max(65535).optional(),
  imapUser:     z.string().min(1).max(255).optional(),
  imapPass:     z.string().min(1).optional(),
  isActive:     z.boolean().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  try { await assertMailboxAccess(user, params.id) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const mailbox = await prisma.mailbox.findUnique({
    where: { id: params.id },
    include: {
      credential: {
        select: {
          fromName: true, fromAddress: true,
          smtpHost: true, smtpPort: true, smtpUser: true,
          imapHost: true, imapPort: true, imapUser: true,
        },
      },
      members: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
  })

  return NextResponse.json(mailbox)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  try { await assertFirmMailboxManage(user) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const d = parsed.data
  const credentialUpdate: Record<string, unknown> = {}
  if (d.fromName)    credentialUpdate.fromName    = d.fromName
  if (d.fromAddress) credentialUpdate.fromAddress = d.fromAddress
  if (d.smtpHost)    credentialUpdate.smtpHost    = d.smtpHost
  if (d.smtpPort)    credentialUpdate.smtpPort    = d.smtpPort
  if (d.smtpUser)    credentialUpdate.smtpUser    = d.smtpUser
  if (d.smtpPass)    credentialUpdate.smtpPassEncrypted = encrypt(d.smtpPass)
  if (d.imapHost)    credentialUpdate.imapHost    = d.imapHost
  if (d.imapPort)    credentialUpdate.imapPort    = d.imapPort
  if (d.imapUser)    credentialUpdate.imapUser    = d.imapUser
  if (d.imapPass)    credentialUpdate.imapPassEncrypted = encrypt(d.imapPass)

  const mailbox = await prisma.mailbox.update({
    where: { id: params.id },
    data: {
      ...(d.displayName !== undefined && { displayName: d.displayName }),
      ...(d.isActive    !== undefined && { isActive:    d.isActive }),
      ...(Object.keys(credentialUpdate).length > 0 && {
        credential: { update: credentialUpdate },
      }),
    },
    select: { id: true, displayName: true, isActive: true, updatedAt: true },
  })

  await writeEmailAudit({
    mailboxId: params.id,
    userId: user.id,
    eventType: 'MAILBOX_UPDATED',
    eventData: { fields: Object.keys(d) },
  })

  return NextResponse.json(mailbox)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  try { await assertFirmMailboxManage(user) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  await prisma.mailbox.update({
    where: { id: params.id },
    data: { isActive: false },
  })

  await writeEmailAudit({
    mailboxId: params.id,
    userId: user.id,
    eventType: 'MAILBOX_DEACTIVATED',
    eventData: {},
  })

  return NextResponse.json({ ok: true })
}
