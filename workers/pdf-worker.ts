/**
 * PDF Export Worker — BullMQ consumer.
 * Run with: npm run worker
 * Reuses a single Puppeteer browser instance across all jobs.
 */
import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import puppeteer, { Browser } from 'puppeteer'
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import { uploadToS3, getSignedDownloadUrl } from '../src/lib/s3'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const prisma = new PrismaClient()

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    logger.info('Puppeteer browser launched')
  }
  return browser
}

interface PdfJobData {
  transactionId: string
  requestedByUserId: string
}

async function generatePdf(job: Job<PdfJobData>): Promise<void> {
  const { transactionId, requestedByUserId } = job.data
  logger.info({ transactionId, jobId: job.id }, 'PDF generation started')

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      property: true,
      seller: true,
      buyer: true,
      fixturesItems: {
        where: { deletedAt: null },
        orderBy: [{ room: 'asc' }, { sortOrder: 'asc' }],
      },
      legalAcknowledgements: { orderBy: { acknowledgedAt: 'desc' }, take: 1 },
      buyerAcceptances: { orderBy: { acceptedAt: 'desc' }, take: 1 },
    },
  })

  if (!tx) throw new Error(`Transaction ${transactionId} not found`)

  const html = buildPdfHtml(tx)

  const b = await getBrowser()
  const page = await b.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    printBackground: true,
  })
  await page.close()

  const key = `transactions/${transactionId}/ta10-${Date.now()}.pdf`
  await uploadToS3(key, Buffer.from(pdfBuffer), 'application/pdf')

  const signedUrl = await getSignedDownloadUrl(key, 86400)

  await prisma.transactionDocument.create({
    data: {
      transactionId,
      documentType: 'TA10_PDF',
      s3Key: key,
      s3Bucket: process.env.AWS_S3_BUCKET!,
      generatedByUserId: requestedByUserId,
    },
  })

  await prisma.auditLog.create({
    data: {
      transactionId,
      userId: requestedByUserId,
      eventType: 'PDF_EXPORT_COMPLETE',
      eventData: { s3Key: key, jobId: job.id },
    },
  })

  logger.info({ transactionId, key }, 'PDF generation complete')

  // Notify via webhook queue (reuse existing queue)
  const { emitWebhookEvent } = await import('../src/lib/webhooks')
  await emitWebhookEvent('PDF_EXPORT_COMPLETE', transactionId, { signedUrl, s3Key: key })
}

function buildPdfHtml(tx: any): string {
  const address = [tx.property.addressLine1, tx.property.addressLine2, tx.property.city, tx.property.postcode]
    .filter(Boolean)
    .join(', ')

  const itemRows = tx.fixturesItems
    .map(
      (item: any) => `
      <tr>
        <td>${item.room}</td>
        <td>${item.description}</td>
        <td>${item.itemType}</td>
        <td>${item.status}</td>
        <td>${item.estimatedValue ? `£${item.estimatedValue}` : '—'}</td>
        <td>${item.notes ?? '—'}</td>
      </tr>`,
    )
    .join('')

  const ack = tx.legalAcknowledgements[0]
  const acc = tx.buyerAcceptances[0]

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; }
  h1 { font-size: 16pt; color: #1e3a5f; }
  h2 { font-size: 13pt; color: #1e3a5f; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: left; font-size: 10pt; }
  td { border: 1px solid #ddd; padding: 5px 8px; font-size: 10pt; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .legal { font-size: 9pt; color: #555; border: 1px solid #ccc; padding: 8px; border-radius: 4px; }
  .meta { font-size: 10pt; margin-bottom: 4px; }
</style>
</head>
<body>
<h1>TA10 Fixtures and Fittings Schedule</h1>
<p class="meta"><strong>Reference:</strong> ${tx.reference}</p>
<p class="meta"><strong>Property:</strong> ${address}</p>
<p class="meta"><strong>Seller:</strong> ${tx.seller.firstName} ${tx.seller.lastName}</p>
<p class="meta"><strong>Buyer:</strong> ${tx.buyer ? `${tx.buyer.firstName} ${tx.buyer.lastName}` : '—'}</p>
<p class="meta"><strong>Seller submitted:</strong> ${tx.sellerSubmittedAt ? new Date(tx.sellerSubmittedAt).toLocaleDateString('en-GB') : '—'}</p>
<p class="meta"><strong>Buyer accepted:</strong> ${tx.buyerAcceptedAt ? new Date(tx.buyerAcceptedAt).toLocaleDateString('en-GB') : 'Pending'}</p>
<p class="meta"><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB')}</p>

<h2>Fixtures & Fittings Items</h2>
<table>
  <thead><tr><th>Room</th><th>Description</th><th>Type</th><th>Status</th><th>Est. Value</th><th>Notes</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>

${ack ? `<h2>Seller Legal Acknowledgement</h2>
<div class="legal">
  <p>${ack.legalText}</p>
  <p><strong>Acknowledged by:</strong> ${tx.seller.firstName} ${tx.seller.lastName}<br>
  <strong>Date:</strong> ${new Date(ack.acknowledgedAt).toLocaleDateString('en-GB')}<br>
  <strong>IP Address:</strong> ${ack.ipAddress}<br>
  <strong>Form version:</strong> ${ack.formVersion}</p>
</div>` : ''}

${acc ? `<h2>Buyer Acceptance</h2>
<div class="legal">
  <p>${acc.acceptanceText}</p>
  <p><strong>Accepted by:</strong> ${tx.buyer?.firstName} ${tx.buyer?.lastName}<br>
  <strong>Date:</strong> ${new Date(acc.acceptedAt).toLocaleDateString('en-GB')}<br>
  <strong>IP Address:</strong> ${acc.ipAddress}</p>
</div>` : ''}

<p style="font-size:9pt;color:#888;margin-top:32px">
  This document is produced under the TA10 protocol. Retained for 7 years per the Limitation Act 1980.
  Generated by FFA — Fixtures &amp; Fittings Assurance Platform.
</p>
</body></html>`
}

const worker = new Worker<PdfJobData>('pdf-export', generatePdf, { connection, concurrency: 2 })

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'PDF job completed'))
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'PDF job failed'))

process.on('SIGTERM', async () => {
  await worker.close()
  if (browser) await browser.close()
  await prisma.$disconnect()
  process.exit(0)
})

logger.info('PDF worker started')
