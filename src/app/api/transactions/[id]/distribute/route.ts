import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { emitWebhookEvent } from '@/lib/webhooks'
import { sendEmail } from '@/lib/email'
import { TransactionStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

// BR-020/021: Conveyancer distributes final agreed schedule to all parties
export const POST = withRBAC('conveyancer:manage', async (_req: NextRequest, { params }) => {
  const session = await getServerSession()

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      seller: true,
      buyer: true,
      agentUser: true,
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (tx.status !== TransactionStatus.BUYER_ACCEPTED) {
    return NextResponse.json(
      { error: 'Transaction must be in BUYER_ACCEPTED status to distribute' },
      { status: 409 },
    )
  }

  await prisma.transaction.update({
    where: { id: params.id },
    data: { status: TransactionStatus.EXCHANGE_COMPLETE, exchangedAt: new Date() },
  })

  await emitWebhookEvent('EXCHANGE_COMPLETE', params.id, {})

  const address = `${tx.property.addressLine1}, ${tx.property.city} ${tx.property.postcode}`
  const distributedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })

  // BR-020/021: notify all parties of final distribution
  const recipients: { email: string; name: string }[] = [
    { email: tx.seller.email, name: `${tx.seller.firstName} ${tx.seller.lastName}` },
  ]
  if (tx.buyer) recipients.push({ email: tx.buyer.email, name: `${tx.buyer.firstName} ${tx.buyer.lastName}` })
  if (tx.agentUser) recipients.push({ email: tx.agentUser.email, name: `${tx.agentUser.firstName} ${tx.agentUser.lastName}` })

  for (const r of recipients) {
    sendEmail({
      to: r.email,
      event: 'DISTRIBUTION_COMPLETE',
      data: { recipientName: r.name, address, reference: tx.reference, distributedAt },
    }).catch(() => {})
  }

  await writeAuditLog({
    eventType: 'DISTRIBUTION_COMPLETE',
    transactionId: params.id,
    userId: (session?.user as any)?.id,
    eventData: { recipientCount: recipients.length },
  })

  return NextResponse.json({ distributed: true })
})
