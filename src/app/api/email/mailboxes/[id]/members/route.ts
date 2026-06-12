export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { assertFirmMailboxManage } from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'

const AddMemberSchema = z.object({
  userId:  z.string().uuid(),
  canSend: z.boolean().default(false),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  try { await assertFirmMailboxManage(user) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const parsed = AddMemberSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const member = await prisma.mailboxMember.upsert({
    where: { mailboxId_userId: { mailboxId: params.id, userId: parsed.data.userId } },
    create: { mailboxId: params.id, userId: parsed.data.userId, canSend: parsed.data.canSend },
    update: { canSend: parsed.data.canSend },
  })

  return NextResponse.json(member, { status: 201 })
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

  const { userId } = await req.json()
  await prisma.mailboxMember.deleteMany({
    where: { mailboxId: params.id, userId },
  })

  return NextResponse.json({ ok: true })
}
