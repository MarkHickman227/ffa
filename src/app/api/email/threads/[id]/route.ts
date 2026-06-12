export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { assertMailboxAccess } from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  const thread = await prisma.emailThread.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      mailboxId: true,
      subject: true,
      messages: {
        orderBy: { receivedAt: 'asc' },
        select: {
          id: true,
          direction: true,
          fromAddress: true,
          fromName: true,
          toAddresses: true,
          ccAddresses: true,
          subject: true,
          bodyText: true,
          bodyHtmlSafe: true,
          isRead: true,
          isStarred: true,
          receivedAt: true,
          attachments: { select: { id: true, filename: true, mimeType: true, size: true } },
        },
      },
    },
  })

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  try { await assertMailboxAccess(user, thread.mailboxId) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  // Mark all inbound messages in thread as read
  await prisma.emailMessage.updateMany({
    where: { threadId: params.id, direction: 'INBOUND', isRead: false },
    data: { isRead: true },
  })

  return NextResponse.json(thread)
}
