export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { encrypt } from '@/lib/encrypt'
import { getServerSession } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const SettingsSchema = z.object({
  smtpHost:         z.string().min(1).default('smtp.gmail.com'),
  smtpPort:         z.coerce.number().int().min(1).max(65535).default(587),
  smtpUser:         z.string().min(1),
  smtpPass:         z.string().optional(),
  emailFromName:    z.string().max(100).optional(),
  emailFromAddress: z.string().email().optional().or(z.literal('')),
  isEmailConfigured: z.boolean().default(true),
})

export const GET = withRBAC('admin:all', async () => {
  const s = await prisma.systemSettings.findFirst()
  return NextResponse.json({
    smtpHost:         s?.smtpHost         ?? '',
    smtpPort:         s?.smtpPort         ?? 587,
    smtpUser:         s?.smtpUser         ?? '',
    smtpPass:         s?.smtpPassEncrypted ? '***' : '',
    emailFromName:    s?.emailFromName    ?? '',
    emailFromAddress: s?.emailFromAddress ?? '',
    isEmailConfigured: s?.isEmailConfigured ?? false,
  })
})

export const PUT = withRBAC('admin:all', async (req: NextRequest) => {
  const session = await getServerSession()
  const body = await req.json()
  const parsed = SettingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { smtpPass, emailFromAddress, ...rest } = parsed.data

  const existing = await prisma.systemSettings.findFirst()

  // Only re-encrypt if a new real password was supplied (not the sentinel '***')
  let smtpPassEncrypted: string | null | undefined = existing?.smtpPassEncrypted ?? null
  if (smtpPass && smtpPass !== '***') {
    const cleaned = smtpPass.replace(/\s/g, '') // strip any copy-paste spaces
    smtpPassEncrypted = encrypt(cleaned)
  }

  const data = {
    ...rest,
    emailFromAddress: emailFromAddress || null,
    smtpPassEncrypted,
    updatedByUserId: (session?.user as any)?.id ?? null,
  }

  if (existing) {
    await prisma.systemSettings.update({ where: { id: existing.id }, data })
  } else {
    await prisma.systemSettings.create({ data })
  }

  return NextResponse.json({ success: true })
})
