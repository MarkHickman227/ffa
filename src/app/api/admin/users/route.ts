export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { getServerSession } from '@/lib/auth'

const uuidRx = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i
const optUUID = z.preprocess(
  (v) => (v == null || v === '' ? undefined : v),
  z.string().regex(uuidRx).optional().nullable()
)

const CreateUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  role: z.nativeEnum(UserRole),
  firmId: optUUID,
  transactionId: optUUID,
})

export const POST = withRBAC('admin:all', async (req: NextRequest) => {
  const session = await getServerSession()
  const adminUserId = (session?.user as any)?.id as string | undefined
  const body = await req.json()
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, phone, role, firmId, transactionId } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })

  if (transactionId) {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { id: true } })
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  const passwordHash = await bcrypt.hash('Password123!', 12)

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      firstName,
      lastName,
      phone: phone || null,
      role,
      firmId: firmId || null,
      passwordHash,
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, firmId: true },
  })

  // Link to transaction based on role
  if (transactionId) {
    if (role === 'SELLER') {
      await prisma.transaction.update({ where: { id: transactionId }, data: { sellerId: user.id } })
    } else if (role === 'BUYER') {
      await prisma.transaction.update({ where: { id: transactionId }, data: { buyerId: user.id } })
    } else if (role === 'CONVEYANCER') {
      await prisma.transaction.update({ where: { id: transactionId }, data: { conveyancerUserId: user.id } })
    } else if (role === 'AGENT') {
      await prisma.transaction.update({ where: { id: transactionId }, data: { agentUserId: user.id } })
    } else if (role === 'BUYER_SOLICITOR') {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          buyerSolicitorName: `${user.firstName} ${user.lastName}`,
          buyerSolicitorEmail: user.email,
          buyerSolicitorPhone: user.phone ?? null,
        },
      })
    }
  }

  // When an Admin is created, set their email as the system From address if not already configured
  if (role === 'ADMIN') {
    const settings = await prisma.systemSettings.findFirst()
    if (!settings?.emailFromAddress) {
      if (settings) {
        await prisma.systemSettings.update({
          where: { id: settings.id },
          data: { emailFromAddress: user.email, emailFromName: `${user.firstName} ${user.lastName}` },
        })
      } else {
        await prisma.systemSettings.create({
          data: { emailFromAddress: user.email, emailFromName: `${user.firstName} ${user.lastName}` },
        })
      }
    }
  }

  writeAuditLog({
    eventType: 'USER_CREATED',
    userId: adminUserId,
    eventData: { createdUserId: user.id, email: user.email, role, transactionId: transactionId ?? null },
  }).catch(() => {})

  return NextResponse.json(user, { status: 201 })
})

export const GET = withRBAC('admin:all', async () => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, firmId: true, firm: { select: { name: true } } },
    orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
  })
  return NextResponse.json(users)
})
