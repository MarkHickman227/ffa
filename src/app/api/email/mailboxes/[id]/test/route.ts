export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/email/crypto'
import { assertMailboxAccess } from '@/lib/email/access-control'
import { SessionUser } from '@/lib/rbac'
import nodemailer from 'nodemailer'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser

  try { await assertMailboxAccess(user, params.id) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }

  const cred = await prisma.mailboxCredential.findUnique({
    where: { mailboxId: params.id },
  })
  if (!cred) return NextResponse.json({ error: 'No credentials configured' }, { status: 422 })

  let smtpPass: string
  try { smtpPass = decrypt(cred.smtpPassEncrypted) }
  catch { return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 500 }) }

  const transport = nodemailer.createTransport({
    host: cred.smtpHost,
    port: cred.smtpPort,
    secure: cred.smtpPort === 465,
    auth: { user: cred.smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  })

  try {
    await transport.verify()
    const adminEmail = (user as any).email
    await transport.sendMail({
      from: `${cred.fromName} <${cred.fromAddress}>`,
      to: adminEmail,
      subject: '[FFA] Mailbox test — SMTP connection successful',
      text: `SMTP test for mailbox "${cred.fromAddress}" succeeded.`,
    })
    return NextResponse.json({ success: true, message: `Test email sent to ${adminEmail}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'SMTP connection failed' }, { status: 422 })
  }
}
