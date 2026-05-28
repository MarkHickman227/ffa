export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { getServerSession } from '@/lib/auth'

const TRANSACTION_ROLES = new Set(['SELLER', 'BUYER', 'CONVEYANCER', 'AGENT', 'SURVEYOR', 'BUYER_SOLICITOR'])

const CreateUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  role: z.nativeEnum(UserRole),
  firmId: z.string().uuid().optional().nullable(),
  transactionId: z.string().uuid().optional().nullable(),
})

export const POST = withRBAC('admin:all', async (req: NextRequest) => {
  const session = await getServerSession()
  const adminUserId = (session?.user as any)?.id as string | undefined
  const body = await req.json()
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { firstName, lastName, email, phone, role, firmId, transactionId } = parsed.data

  if (TRANSACTION_ROLES.has(role) && !transactionId) {
    return NextResponse.json({ error: 'A transaction must be selected for this role.' }, { status: 422 })
  }

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
    } else if (role === 'SURVEYOR') {
      prisma.surveyorAccess.create({
        data: {
          transactionId,
          surveyorUserId: user.id,
          grantedByUserId: adminUserId ?? user.id,
        },
      }).catch(() => {})
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
