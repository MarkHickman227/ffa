/**
 * IMAP Sync Worker — BullMQ consumer.
 * Polls all active mailboxes and syncs new IMAP messages into the DB.
 * Run with: npx tsx workers/email-sync.ts
 */
import { Worker, Queue, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createHash, createDecipheriv, type BinaryLike } from 'crypto'
import pino from 'pino'
import { uploadToS3 } from '../src/lib/s3'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const prisma = new PrismaClient()

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
const syncQueue = new Queue('email-sync', { connection })

// ─── Crypto (mirrors src/lib/encrypt.ts) ──────────────────────────────────────
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

// ─── Sanitise (mirrors src/lib/email/sanitise.ts without Next.js imports) ─────
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

interface SyncJobData {
  mailboxId: string
}

async function syncMailbox(job: Job<SyncJobData>) {
  const { mailboxId } = job.data
  logger.info({ mailboxId, jobId: job.id }, 'Starting IMAP sync')

  const mailbox = await prisma.mailbox.findUnique({
    where: { id: mailboxId, isActive: true },
    include: { credential: true },
  })
  if (!mailbox?.credential) {
    logger.warn({ mailboxId }, 'Mailbox not found or no credentials')
    return
  }

  const cred = mailbox.credential
  let imapPass: string
  try { imapPass = decrypt(cred.imapPassEncrypted) }
  catch (e) { logger.error({ mailboxId }, 'Failed to decrypt IMAP credentials'); return }

  const client = new ImapFlow({
    host: cred.imapHost,
    port: cred.imapPort,
    secure: cred.imapPort === 993,
    auth: { user: cred.imapUser, pass: imapPass },
    logger: false,
    tls: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const syncState = await prisma.mailboxSyncState.findUnique({
        where: { mailboxId_folder: { mailboxId, folder: 'INBOX' } },
      })

      const status = await client.status('INBOX', { uidValidity: true, uidNext: true })
      const uidValidity = Number(status.uidValidity)
      const lastUid = syncState?.uidValidity === uidValidity ? (syncState.lastUid ?? 0) : 0

      const query = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { all: true as const }
      const messages: number[] = []

      for await (const msg of client.fetch(query, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        try {
          const parsed = await simpleParser(msg.source)
          const messageId = parsed.messageId ?? null
          const subject = parsed.subject ?? '(no subject)'

          if (messageId) {
            const exists = await prisma.emailMessage.findFirst({
              where: { mailboxId, messageId },
              select: { id: true },
            })
            if (exists) continue
          }

          // Find or create thread based on subject (strip Re:/Fwd:)
          const threadSubject = subject.replace(/^(re|fwd|fw):\s*/gi, '').trim()
          let thread = await prisma.emailThread.findFirst({
            where: { mailboxId, subject: { equals: threadSubject, mode: 'insensitive' } },
            orderBy: { lastMessageAt: 'desc' },
          })
          if (!thread) {
            thread = await prisma.emailThread.create({
              data: { mailboxId, subject: threadSubject },
            })
          }

          const fromAddr = parsed.from?.value?.[0]
          const toAddrs = (parsed.to as any)?.value?.map((a: any) => a.address).filter(Boolean) ?? []
          const ccAddrs = (parsed.cc as any)?.value?.map((a: any) => a.address).filter(Boolean) ?? []

          const message = await prisma.emailMessage.create({
            data: {
              threadId:    thread.id,
              mailboxId,
              messageId:   messageId ?? null,
              imapUid:     Number(msg.uid),
              imapFolder:  'INBOX',
              inReplyTo:   parsed.inReplyTo ?? null,
              direction:   'INBOUND',
              fromAddress: fromAddr?.address ?? 'unknown',
              fromName:    fromAddr?.name ?? null,
              toAddresses: toAddrs,
              ccAddresses: ccAddrs,
              subject:     parsed.subject ?? '(no subject)',
              bodyText:    parsed.text ?? null,
              bodyHtml:    parsed.html || null,
              bodyHtmlSafe: parsed.html ? stripHtmlTags(parsed.html) : null,
              receivedAt:  parsed.date ?? new Date(),
            },
          })

          // Upload attachments to S3
          const hasAttachments = (parsed.attachments?.length ?? 0) > 0
          for (const att of parsed.attachments ?? []) {
            if (!att.content || att.contentDisposition === 'inline') continue
            const s3Key = `email-attachments/${mailboxId}/${message.id}/${att.filename ?? 'file'}`
            await uploadToS3(s3Key, att.content, att.contentType)
            await prisma.emailAttachment.create({
              data: {
                messageId: message.id,
                filename:  att.filename ?? 'attachment',
                mimeType:  att.contentType,
                size:      att.size ?? att.content.length,
                s3Key,
              },
            })
          }

          // Update thread stats
          await prisma.emailThread.update({
            where: { id: thread.id },
            data: {
              messageCount:   { increment: 1 },
              hasAttachments: hasAttachments ? true : undefined,
              lastMessageAt:  parsed.date ?? new Date(),
            },
          })

          messages.push(Number(msg.uid))
        } catch (msgErr) {
          logger.error({ mailboxId, uid: msg.uid, err: msgErr }, 'Failed to process message')
        }
      }

      const maxUid = messages.length > 0 ? Math.max(...messages) : lastUid
      await prisma.mailboxSyncState.upsert({
        where: { mailboxId_folder: { mailboxId, folder: 'INBOX' } },
        create: { mailboxId, folder: 'INBOX', uidValidity, lastUid: maxUid, syncedAt: new Date() },
        update: { uidValidity, lastUid: maxUid, syncedAt: new Date() },
      })

      logger.info({ mailboxId, synced: messages.length }, 'IMAP sync complete')
    } finally {
      lock.release()
    }
  } catch (err) {
    logger.error({ mailboxId, err }, 'IMAP connection failed')
    throw err
  } finally {
    await client.logout().catch(() => {})
  }
}

// ─── Worker ────────────────────────────────────────────────────────────────────
const worker = new Worker<SyncJobData>('email-sync', syncMailbox, {
  connection,
  concurrency: 3,
})

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Sync job completed'))
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Sync job failed'))

// ─── Scheduler: queue a sync for every active mailbox every 5 minutes ─────────
async function scheduleAll() {
  const mailboxes = await prisma.mailbox.findMany({
    where: { isActive: true },
    select: { id: true },
  })
  for (const mb of mailboxes) {
    await syncQueue.add('sync', { mailboxId: mb.id }, {
      jobId: `sync-${mb.id}`,
      removeOnComplete: true,
      removeOnFail: 100,
    })
  }
  logger.info({ count: mailboxes.length }, 'Sync jobs queued')
}

scheduleAll()
setInterval(scheduleAll, 5 * 60 * 1000)

process.on('SIGTERM', async () => {
  await worker.close()
  process.exit(0)
})
