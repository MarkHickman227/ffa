export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { assertMailboxAccess } from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  const attachment = await prisma.emailAttachment.findUnique({
    where: { id: params.id },
    include: { message: { select: { mailboxId: true } } },
  })
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try { await assertMailboxAccess(user, attachment.message.mailboxId) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const url = await getSignedDownloadUrl(attachment.s3Key, 300)
  return NextResponse.redirect(url)
}
