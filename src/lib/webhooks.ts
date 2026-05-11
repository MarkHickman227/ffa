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
  | 'SURVEYOR_ACCESS_GRANTED'
  | 'EXCHANGE_COMPLETE'

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const webhookQueue = new Queue('webhook-events', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export const pdfQueue = new Queue('pdf-export', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
})

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

  await webhookQueue.add(event, payload)
  logger.info({ event, transactionId }, 'Webhook event enqueued')
}

export async function enqueuePdfExport(transactionId: string, requestedByUserId: string): Promise<string> {
  const job = await pdfQueue.add('generate-pdf', { transactionId, requestedByUserId })
  logger.info({ jobId: job.id, transactionId }, 'PDF export job enqueued')
  return job.id!
}
