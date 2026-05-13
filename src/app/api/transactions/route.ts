export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { getServerSession } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const CreateTransactionSchema = z.object({
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  postcode: z.string().min(1).max(10),
  sellerEmail: z.string().email(),
  sellerFirstName: z.string().min(1).max(100),
  sellerLastName: z.string().min(1).max(100),
})

export const POST = withRBAC('transaction:create', async (req: NextRequest) => {
  const session = await getServerSession()
  const body = await req.json()
  const parsed = CreateTransactionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const user = session!.user as any

  // Generate next sequential reference for this year
  const year = new Date().getFullYear()
  const count = await prisma.transaction.count({
    where: { reference: { startsWith: `FFA-${year}-` } },
  })
  const reference = `FFA-${year}-${String(count + 1).padStart(4, '0')}`

  // Find or create the seller user (magic-link role, no password)
  const seller = await prisma.user.upsert({
    where: { email: parsed.data.sellerEmail.toLowerCase() },
    create: {
      email: parsed.data.sellerEmail.toLowerCase(),
      firstName: parsed.data.sellerFirstName,
      lastName: parsed.data.sellerLastName,
      role: 'SELLER',
    },
    update: {},
  })

  const property = await prisma.property.create({
    data: {
      addressLine1: parsed.data.addressLine1,
      addressLine2: parsed.data.addressLine2,
      city: parsed.data.city,
      postcode: parsed.data.postcode.toUpperCase(),
    },
  })

  const tx = await prisma.transaction.create({
    data: {
      reference,
      status: 'DRAFT',
      propertyId: property.id,
      sellerId: seller.id,
      conveyancerFirmId: user.firmId ?? null,
    },
  })

  await writeAuditLog({
    eventType: 'TRANSACTION_CREATED',
    transactionId: tx.id,
    userId: session!.user.id,
    eventData: { reference, sellerEmail: parsed.data.sellerEmail },
  })

  return NextResponse.json({ ...tx, reference, sellerId: seller.id }, { status: 201 })
})
