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

  // Pre-fetch signed S3 URLs for all item photos (1 hour validity — enough for Puppeteer to fetch)
  const photoUrlsMap: Record<string, string[]> = {}
  await Promise.all(
    tx.fixturesItems.map(async (item: any) => {
      if (item.photoUrls && item.photoUrls.length > 0) {
        photoUrlsMap[item.id] = await Promise.all(
          item.photoUrls.map((key: string) => getSignedDownloadUrl(key, 3600)),
        )
      }
    }),
  )

  const html = buildPdfHtml(tx, photoUrlsMap)

  const b = await getBrowser()
  const page = await b.newPage()
  // waitUntil: 'networkidle0' ensures Puppeteer waits for all photo <img> requests to complete
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

  const { emitWebhookEvent } = await import('../src/lib/webhooks')
  await emitWebhookEvent('PDF_EXPORT_COMPLETE', transactionId, { signedUrl, s3Key: key })
}

const STATUS_LABEL: Record<string, string> = {
  INCLUDED: 'Included',
  EXCLUDED: 'Excluded',
  NEGOTIABLE: 'Negotiable',
  REMOVED_PRIOR: 'Removed Prior',
}

const STATUS_BG: Record<string, string> = {
  INCLUDED: '#dcfce7',
  EXCLUDED: '#fee2e2',
  NEGOTIABLE: '#fef9c3',
  REMOVED_PRIOR: '#f1f5f9',
}

const RISK_LABEL: Record<string, string> = {
  NONE: '',
  LOW: '⚑ Low risk',
  MEDIUM: '⚑ Medium risk',
  HIGH: '⚑ High risk',
}

const RISK_COLOUR: Record<string, string> = {
  LOW: '#2563eb',
  MEDIUM: '#d97706',
  HIGH: '#dc2626',
}

function buildPdfHtml(tx: any, photoUrlsMap: Record<string, string[]>): string {
  const address = [tx.property.addressLine1, tx.property.addressLine2, tx.property.city, tx.property.postcode]
    .filter(Boolean)
    .join(', ')

  const itemRows = tx.fixturesItems
    .map((item: any) => {
      const photos = photoUrlsMap[item.id] ?? []
      const statusBg = STATUS_BG[item.status] ?? '#f1f5f9'
      const statusLabel = STATUS_LABEL[item.status] ?? item.status
      const riskLabel = RISK_LABEL[item.riskFlag] ?? ''
      const riskColour = RISK_COLOUR[item.riskFlag] ?? ''

      const photoHtml =
        photos.length > 0
          ? `<div class="photos">${photos.map((url, i) => `<img src="${url}" alt="Photo ${i + 1}" loading="eager" />`).join('')}</div>`
          : ''

      const noteHtml = item.notes ? `<div class="note">Note: ${item.notes}</div>` : ''
      const riskHtml =
        riskLabel && !item.riskFlagDismissedAt
          ? `<div class="risk" style="color:${riskColour}">${riskLabel}</div>`
          : ''

      return `
      <tr>
        <td class="room-cell">${item.room}</td>
        <td class="desc-cell">
          <strong>${item.description}</strong>
          ${riskHtml}
          ${photoHtml}
          ${noteHtml}
        </td>
        <td>${item.itemType.replace(/_/g, ' ')}</td>
        <td style="background:${statusBg}">${statusLabel}</td>
        <td class="value-cell">${item.estimatedValue ? `£${Number(item.estimatedValue).toFixed(2)}` : '—'}</td>
      </tr>`
    })
    .join('')

  const ack = tx.legalAcknowledgements[0]
  const acc = tx.buyerAcceptances[0]

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #111; margin: 0; }
  h1 { font-size: 17pt; color: #1e3a5f; margin: 0 0 12px 0; }
  h2 { font-size: 12pt; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 3px; margin: 20px 0 10px 0; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; margin-bottom: 16px; }
  .meta { font-size: 10pt; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1e3a5f; color: #fff; padding: 7px 8px; text-align: left; font-size: 10pt; }
  td { border: 1px solid #ddd; padding: 6px 8px; font-size: 10pt; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .room-cell { white-space: nowrap; font-weight: 600; width: 14%; }
  .desc-cell { width: 38%; }
  .value-cell { white-space: nowrap; }
  .photos { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .photos img { width: 110px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc; display: block; }
  .note { font-size: 9pt; color: #666; margin-top: 5px; font-style: italic; }
  .risk { font-size: 9pt; font-weight: 600; margin-top: 3px; }
  .legal { font-size: 9pt; color: #444; border: 1px solid #ccc; padding: 10px 12px; border-radius: 4px; margin-bottom: 12px; }
  .legal p { margin: 3px 0; line-height: 1.5; }
  .footer { font-size: 8.5pt; color: #888; margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>

<h1>TA10 Fixtures and Fittings Schedule</h1>

<div class="meta-grid">
  <p class="meta"><strong>Reference:</strong> ${tx.reference}</p>
  <p class="meta"><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB')}</p>
  <p class="meta"><strong>Property:</strong> ${address}</p>
  <p class="meta"><strong>Status:</strong> ${tx.status.replace(/_/g, ' ')}</p>
  <p class="meta"><strong>Seller:</strong> ${tx.seller.firstName} ${tx.seller.lastName}</p>
  <p class="meta"><strong>Buyer:</strong> ${tx.buyer ? `${tx.buyer.firstName} ${tx.buyer.lastName}` : 'Not yet assigned'}</p>
  <p class="meta"><strong>Seller submitted:</strong> ${tx.sellerSubmittedAt ? new Date(tx.sellerSubmittedAt).toLocaleDateString('en-GB') : 'Pending'}</p>
  <p class="meta"><strong>Buyer accepted:</strong> ${tx.buyerAcceptedAt ? new Date(tx.buyerAcceptedAt).toLocaleDateString('en-GB') : 'Pending'}</p>
</div>

<h2>Fixtures &amp; Fittings Items</h2>
<table>
  <thead>
    <tr>
      <th>Room</th>
      <th>Description &amp; Photos</th>
      <th>Type</th>
      <th>Status</th>
      <th>Est. Value</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

${
  ack
    ? `<h2>Seller Legal Acknowledgement</h2>
<div class="legal">
  <p>${ack.legalText}</p>
  <p><strong>Acknowledged by:</strong> ${tx.seller.firstName} ${tx.seller.lastName}</p>
  <p><strong>Date:</strong> ${new Date(ack.acknowledgedAt).toLocaleDateString('en-GB')} &nbsp;|&nbsp;
     <strong>IP:</strong> ${ack.ipAddress} &nbsp;|&nbsp;
     <strong>Form version:</strong> ${ack.formVersion}</p>
</div>`
    : ''
}

${
  acc
    ? `<h2>Buyer Acceptance</h2>
<div class="legal">
  <p>${acc.acceptanceText}</p>
  <p><strong>Accepted by:</strong> ${tx.buyer?.firstName} ${tx.buyer?.lastName}</p>
  <p><strong>Date:</strong> ${new Date(acc.acceptedAt).toLocaleDateString('en-GB')} &nbsp;|&nbsp;
     <strong>IP:</strong> ${acc.ipAddress}</p>
</div>`
    : ''
}

<div class="footer">
  This document is produced under the TA10 protocol and is retained for 7 years per the Limitation Act 1980.
  Generated by FFA — Fixtures &amp; Fittings Assurance Platform.
</div>
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
