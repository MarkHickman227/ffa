export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { assertMailboxAccess } from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  const mailboxId = req.nextUrl.searchParams.get('mailboxId')
  if (!mailboxId) return NextResponse.json({ error: 'mailboxId required' }, { status: 400 })

  try { await assertMailboxAccess(user, mailboxId) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const cursor = req.nextUrl.searchParams.get('cursor')
  const take = 50

  const threads = await prisma.emailThread.findMany({
    where: { mailboxId },
    orderBy: { lastMessageAt: 'desc' },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      subject: true,
      messageCount: true,
      hasAttachments: true,
      lastMessageAt: true,
      messages: {
        orderBy: { receivedAt: 'desc' },
        take: 1,
        select: {
          fromName: true,
          fromAddress: true,
          bodyText: true,
          isRead: true,
          direction: true,
          receivedAt: true,
        },
      },
    },
  })

  const nextCursor = threads.length === take ? threads[threads.length - 1].id : null
  return NextResponse.json({ threads, nextCursor })
}
