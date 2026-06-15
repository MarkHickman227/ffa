import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { sendSellerFormInvite } from '@/lib/seller-invite'
import { NextRequest, NextResponse } from 'next/server'

export const POST = withRBAC('admin:all', async (_req: NextRequest, { params }) => {
  const tx = await prisma.transaction.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      property: { select: { addressLine1: true, city: true, postcode: true } },
      seller: { select: { firstName: true, lastName: true, email: true } },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['EXCHANGE_COMPLETE', 'ARCHIVED'].includes(tx.status)) {
    return NextResponse.json({ error: 'Transaction is locked' }, { status: 409 })
  }

  const address = [tx.property.addressLine1, tx.property.city, tx.property.postcode].filter(Boolean).join(', ')

  await sendSellerFormInvite({
    sellerEmail: tx.seller.email,
    sellerName: `${tx.seller.firstName} ${tx.seller.lastName}`,
    transactionId: tx.id,
    reference: tx.reference,
    address,
  })

  return NextResponse.json({ sent: true, to: tx.seller.email })
})
