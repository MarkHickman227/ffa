/**
 * Seller reminder worker — runs every 6 hours.
 * Sends SELLER_REMINDER_7D and SELLER_REMINDER_14D emails to sellers
 * who have not yet submitted their form.
 * Checks AuditLog to avoid duplicate sends.
 */
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import { sendEmail } from '../src/lib/email'
import { generateSellerToken } from '../src/lib/seller-access'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const prisma = new PrismaClient()

const INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

async function checkReminders() {
  const now = new Date()
  const day = 24 * 60 * 60 * 1000

  const d7start  = new Date(now.getTime() - 8 * day)
  const d7end    = new Date(now.getTime() - 7 * day)
  const d14start = new Date(now.getTime() - 15 * day)
  const d14end   = new Date(now.getTime() - 14 * day)

  const [candidates7d, candidates14d] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: 'SELLER_FORM_IN_PROGRESS', deletedAt: null, createdAt: { gte: d7start, lte: d7end } },
      include: { seller: true, property: true },
    }),
    prisma.transaction.findMany({
      where: { status: 'SELLER_FORM_IN_PROGRESS', deletedAt: null, createdAt: { gte: d14start, lte: d14end } },
      include: { seller: true, property: true },
    }),
  ])

  logger.info({ count7d: candidates7d.length, count14d: candidates14d.length }, '[reminder] candidates found')

  for (const tx of candidates7d) {
    if (!tx.seller) continue
    const already = await prisma.auditLog.findFirst({ where: { transactionId: tx.id, eventType: 'SELLER_REMINDER_7D' } })
    if (already) continue

    const address = [tx.property.addressLine1, tx.property.city, tx.property.postcode].filter(Boolean).join(', ')
    const url = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3001'}/seller/${tx.id}?token=${generateSellerToken(tx.id)}`

    try {
      await sendEmail({
        to: tx.seller.email,
        event: 'SELLER_REMINDER_7D',
        data: {
          sellerName: `${tx.seller.firstName} ${tx.seller.lastName}`,
          address,
          reference: tx.reference,
          url,
        },
      })
      await prisma.auditLog.create({
        data: { eventType: 'SELLER_REMINDER_7D', transactionId: tx.id, eventData: { email: tx.seller.email } },
      })
      logger.info({ txId: tx.id }, '[reminder] 7d sent')
    } catch (err) {
      logger.error({ err, txId: tx.id }, '[reminder] 7d failed')
    }
  }

  for (const tx of candidates14d) {
    if (!tx.seller) continue
    const already = await prisma.auditLog.findFirst({ where: { transactionId: tx.id, eventType: 'SELLER_REMINDER_14D' } })
    if (already) continue

    const address = [tx.property.addressLine1, tx.property.city, tx.property.postcode].filter(Boolean).join(', ')
    const url = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3001'}/seller/${tx.id}?token=${generateSellerToken(tx.id)}`

    try {
      await sendEmail({
        to: tx.seller.email,
        event: 'SELLER_REMINDER_14D',
        data: {
          sellerName: `${tx.seller.firstName} ${tx.seller.lastName}`,
          address,
          reference: tx.reference,
          url,
        },
      })
      await prisma.auditLog.create({
        data: { eventType: 'SELLER_REMINDER_14D', transactionId: tx.id, eventData: { email: tx.seller.email } },
      })
      logger.info({ txId: tx.id }, '[reminder] 14d sent')
    } catch (err) {
      logger.error({ err, txId: tx.id }, '[reminder] 14d failed')
    }
  }
}

checkReminders()
setInterval(checkReminders, INTERVAL_MS)
