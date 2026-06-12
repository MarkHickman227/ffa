import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { SessionUser } from '@/lib/rbac'

export async function assertMailboxAccess(
  user: SessionUser,
  mailboxId: string,
): Promise<void> {
  if (user.role === 'ADMIN') {
    const mb = await prisma.mailbox.findFirst({
      where: { id: mailboxId, isActive: true },
      select: { id: true },
    })
    if (!mb) throw new MailboxNotFoundError()
    return
  }

  // For non-admins: mailbox must belong to their firm AND they must be a member
  const mb = await prisma.mailbox.findFirst({
    where: {
      id: mailboxId,
      firmId: user.firmId ?? '__none__',
      isActive: true,
      members: { some: { userId: user.id } },
    },
    select: { id: true },
  })
  if (!mb) throw new MailboxNotFoundError()
}

export async function assertMailboxSendAccess(
  user: SessionUser,
  mailboxId: string,
): Promise<void> {
  if (user.role === 'ADMIN') {
    await assertMailboxAccess(user, mailboxId)
    return
  }
  const mb = await prisma.mailbox.findFirst({
    where: {
      id: mailboxId,
      firmId: user.firmId ?? '__none__',
      isActive: true,
      members: { some: { userId: user.id, canSend: true } },
    },
    select: { id: true },
  })
  if (!mb) throw new MailboxNotFoundError()
}

export async function assertFirmMailboxManage(user: SessionUser): Promise<void> {
  if (user.role !== 'ADMIN' && user.role !== 'CONVEYANCER') {
    throw new ForbiddenError()
  }
}

export class MailboxNotFoundError extends Error {
  status = 404
  constructor() { super('Mailbox not found') }
}

export class ForbiddenError extends Error {
  status = 403
  constructor() { super('Forbidden') }
}

export async function writeEmailAudit(opts: {
  mailboxId?: string
  userId?: string
  eventType: string
  eventData: Prisma.InputJsonObject
  ipAddress?: string
}): Promise<void> {
  await prisma.emailAuditLog.create({ data: opts }).catch(() => {})
}
