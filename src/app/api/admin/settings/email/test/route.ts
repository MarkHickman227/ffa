export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { decrypt } from '@/lib/encrypt'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import nodemailer from 'nodemailer'

const TestSchema = z.object({
  smtpHost:         z.string().min(1).default('smtp.gmail.com'),
  smtpPort:         z.coerce.number().int().min(1).max(65535).default(587),
  smtpUser:         z.string().email(),
  smtpPass:         z.string().min(1),
  emailFromName:    z.string().optional(),
  emailFromAddress: z.string().email().optional().or(z.literal('')),
})

export const POST = withRBAC('admin:all', async (req: NextRequest) => {
  const body = await req.json()

  // If the password is the masked sentinel, load the real one from DB
  let smtpPass = typeof body.smtpPass === 'string' ? body.smtpPass.replace(/\s/g, '') : ''
  if (smtpPass === '***') {
    const s = await prisma.systemSettings.findFirst()
    if (!s?.smtpPassEncrypted) {
      return NextResponse.json({ error: 'No saved password found — please enter your SMTP password.' }, { status: 422 })
    }
    try { smtpPass = decrypt(s.smtpPassEncrypted) }
    catch { return NextResponse.json({ error: 'Failed to decrypt saved password.' }, { status: 500 }) }
  }

  const parsed = TestSchema.safeParse({ ...body, smtpPass })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { smtpHost, smtpPort, smtpUser, emailFromName, emailFromAddress } = parsed.data
  const from = emailFromName && emailFromAddress
    ? `${emailFromName} <${emailFromAddress}>`
    : emailFromAddress || smtpUser

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  try {
    await transporter.verify()
    await transporter.sendMail({
      from,
      to: smtpUser,
      subject: '[FFA] Test email — SMTP connection successful',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px">
          <h2 style="color:#1e3a5f">SMTP Connection Successful</h2>
          <p>Your FFA email settings are working correctly.</p>
          <ul style="color:#374151;font-size:14px">
            <li>Host: <strong>${smtpHost}:${smtpPort}</strong></li>
            <li>User: <strong>${smtpUser}</strong></li>
            <li>From: <strong>${from}</strong></li>
          </ul>
        </div>`,
    })
    return NextResponse.json({ success: true, message: `Test email sent to ${smtpUser} — check your inbox.` })
  } catch (err: any) {
    // Surface the nodemailer error message clearly
    const msg = err?.message ?? 'SMTP connection failed'
    return NextResponse.json({ error: msg }, { status: 422 })
  }
})
