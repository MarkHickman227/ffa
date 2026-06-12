/**
 * Email Send Worker — BullMQ consumer.
 * Processes OutboundQueue rows and sends via SMTP.
 * Run with: npx tsx workers/email-send.ts
 */
import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import nodemailer from 'nodemailer'
import { createHash, createDecipheriv } from 'crypto'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const prisma = new PrismaClient()

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// ─── Crypto ────────────────────────────────────────────────────────────────────
function getKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY ?? ''
  if (!raw) throw new Error('SETTINGS_ENCRYPTION_KEY is not set')
  return createHash('sha256').update(raw).digest()
}
function decrypt(ciphertext: string): string {
  const key = getKey()
  const [ivHex, authTagHex, encHex] = ciphertext.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

interface SendJobData {
  outboundId: string
}

async function sendEmail(job: Job<SendJobData>) {
  const { outboundId } = job.data

  const outbound = await prisma.outboundQueue.findUnique({
    where: { id: outboundId },
    include: { mailbox: { include: { credential: true } } },
  })
  if (!outbound) { logger.warn({ outboundId }, 'Outbound record not found'); return }
  if (outbound.status === 'SENT') { logger.info({ outboundId }, 'Already sent, skipping'); return }

  const cred = outbound.mailbox.credential
  if (!cred) throw new Error(`No credentials for mailbox ${outbound.mailboxId}`)

  let smtpPass: string
  try { smtpPass = decrypt(cred.smtpPassEncrypted) }
  catch (e) { throw new Error('Failed to decrypt SMTP credentials') }

  await prisma.outboundQueue.update({ where: { id: outboundId }, data: { status: 'SENDING' } })

  const transport = nodemailer.createTransport({
    host: cred.smtpHost,
    port: cred.smtpPort,
    secure: cred.smtpPort === 465,
    auth: { user: cred.smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  })

  try {
    const info = await transport.sendMail({
      from: `${outbound.fromName ?? outbound.fromAddress} <${outbound.fromAddress}>`,
      to: outbound.toAddresses.join(', '),
      cc: outbound.ccAddresses.length > 0 ? outbound.ccAddresses.join(', ') : undefined,
      subject: outbound.subject,
      text: outbound.bodyText ?? undefined,
      html: outbound.bodyHtml ?? undefined,
      ...(outbound.inReplyTo ? { inReplyTo: outbound.inReplyTo, references: outbound.inReplyTo } : {}),
    })

    await prisma.outboundQueue.update({
      where: { id: outboundId },
      data: { status: 'SENT', sentAt: new Date(), lastError: null },
    })

    // Store sent message in thread
    const messageId = (info as any).messageId ?? null
    const threadId = outbound.threadId

    let resolvedThreadId = threadId
    if (!resolvedThreadId) {
      const thread = await prisma.emailThread.create({
        data: {
          mailboxId: outbound.mailboxId,
          subject: outbound.subject,
          lastMessageAt: new Date(),
        },
      })
      resolvedThreadId = thread.id
    }

    await prisma.emailMessage.create({
      data: {
        threadId:    resolvedThreadId,
        mailboxId:   outbound.mailboxId,
        messageId:   messageId,
        inReplyTo:   outbound.inReplyTo ?? null,
        direction:   'OUTBOUND',
        fromAddress: outbound.fromAddress,
        fromName:    outbound.fromName ?? null,
        toAddresses: outbound.toAddresses,
        ccAddresses: outbound.ccAddresses,
        subject:     outbound.subject,
        bodyText:    outbound.bodyText ?? null,
        bodyHtml:    outbound.bodyHtml ?? null,
        isRead:      true,
        receivedAt:  new Date(),
      },
    })

    await prisma.emailThread.update({
      where: { id: resolvedThreadId },
      data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    })

    logger.info({ outboundId, to: outbound.toAddresses }, 'Email sent successfully')
  } catch (err: any) {
    await prisma.outboundQueue.update({
      where: { id: outboundId },
      data: {
        status: 'FAILED',
        retries: { increment: 1 },
        lastError: err.message ?? 'Send failed',
      },
    })
    throw err
  }
}

const worker = new Worker<SendJobData>('email-send', sendEmail, {
  connection,
  concurrency: 5,
})

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Send job completed'))
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Send job failed'))

process.on('SIGTERM', async () => {
  await worker.close()
  process.exit(0)
})
