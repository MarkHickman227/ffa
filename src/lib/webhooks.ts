import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { writeAuditLog } from './audit'
import { logger } from './logger'

export type WebhookEvent =
  | 'SELLER_FORM_SUBMITTED'
  | 'BUYER_ACCEPTED'
  | 'ENQUIRY_RAISED'
  | 'ENQUIRY_ANSWERED'
  | 'RISK_FLAG_RAISED'
  | 'RISK_FLAG_DISMISSED'
  | 'PDF_EXPORT_COMPLETE'
  | 'RECONCILIATION_CONFLICT'
  | 'EXCHANGE_COMPLETE'

let _connection: IORedis | null = null
let _webhookQueue: Queue | null = null
let _pdfQueue: Queue | null = null

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })
  }
  return _connection
}

function getWebhookQueue(): Queue {
  if (!_webhookQueue) {
    _webhookQueue = new Queue('webhook-events', {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    })
  }
  return _webhookQueue
}

function getPdfQueue(): Queue {
  if (!_pdfQueue) {
    _pdfQueue = new Queue('pdf-export', {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    })
  }
  return _pdfQueue
}

export interface WebhookPayload {
  event: WebhookEvent
  transactionId: string
  data: Record<string, unknown>
  timestamp: string
}

export async function emitWebhookEvent(
  event: WebhookEvent,
  transactionId: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    transactionId,
    data,
    timestamp: new Date().toISOString(),
  }

  await getWebhookQueue().add(event, payload)
  logger.info({ event, transactionId }, 'Webhook event enqueued')
}

export async function enqueuePdfExport(transactionId: string, requestedByUserId: string): Promise<string> {
  const job = await getPdfQueue().add('generate-pdf', { transactionId, requestedByUserId })
  logger.info({ jobId: job.id, transactionId }, 'PDF export job enqueued')
  return job.id!
}
