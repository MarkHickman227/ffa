/**
 * Webhook Delivery Worker — BullMQ consumer.
 * Delivers webhook events to registered internal subscribers.
 * Retries up to 3 times with exponential backoff.
 */
import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import type { WebhookPayload } from '../src/lib/webhooks'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const prisma = new PrismaClient()

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// Internal subscribers — in production replace with DB-backed subscriber list
const INTERNAL_SUBSCRIBERS: Array<{ url: string; events: string[] }> = [
  // e.g. { url: 'https://internal.ffa.law/webhooks/conveyancer', events: ['BUYER_ACCEPTED'] }
]

async function deliverWebhook(job: Job<WebhookPayload>): Promise<void> {
  const payload = job.data
  logger.info({ event: payload.event, transactionId: payload.transactionId, jobId: job.id }, 'Delivering webhook')

  const subscribers = INTERNAL_SUBSCRIBERS.filter(
    (s) => s.events.length === 0 || s.events.includes(payload.event),
  )

  const deliveries = await Promise.allSettled(
    subscribers.map((sub) =>
      fetch(sub.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-FFA-Event': payload.event },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${sub.url}`)
        return res
      }),
    ),
  )

  const failures = deliveries.filter((d) => d.status === 'rejected')
  if (failures.length > 0) {
    for (const f of failures) {
      logger.error({ event: payload.event, err: (f as PromiseRejectedResult).reason }, 'Webhook delivery failed')
      // Log to AuditLog non-blockingly
      prisma.auditLog.create({
        data: {
          transactionId: payload.transactionId,
          eventType: 'WEBHOOK_DELIVERY_FAILED',
          eventData: { event: payload.event, error: String((f as PromiseRejectedResult).reason) },
        },
      }).catch(() => {})
    }
    throw new Error(`${failures.length}/${subscribers.length} webhook deliveries failed`)
  }
}

const worker = new Worker<WebhookPayload>('webhook-events', deliverWebhook, {
  connection,
  concurrency: 5,
})

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Webhook delivered'))
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Webhook job failed permanently'))

process.on('SIGTERM', async () => {
  await worker.close()
  await prisma.$disconnect()
  process.exit(0)
})

logger.info('Webhook worker started')
