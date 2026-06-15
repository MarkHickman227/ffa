import nodemailer from 'nodemailer'
import { logger } from './logger'

export interface ItemRow {
  room: string
  name: string
  brand?: string | null
  type: string    // e.g. "Fixture", "Appliance", "Fitting"
  status: string  // "Included" | "Excluded" | "Negotiable"
  value?: number | null
  notes?: string | null
}

export function buildItemsTable(items: ItemRow[]): string {
  if (items.length === 0) return ''

  const byRoom: Record<string, ItemRow[]> = {}
  for (const item of items) {
    const room = item.room || 'Other'
    byRoom[room] = byRoom[room] ?? []
    byRoom[room].push(item)
  }

  const statusColor = (s: string) =>
    s === 'Excluded' ? '#dc2626' : s === 'Negotiable' ? '#d97706' : '#16a34a'

  let html = `<div style="margin-top:24px;border-top:2px solid #1e3a5f;padding-top:20px">`
  html += `<h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin:0 0 16px">Fixtures &amp; Fittings Schedule — ${items.length} item${items.length !== 1 ? 's' : ''}</h3>`

  for (const [room, roomItems] of Object.entries(byRoom)) {
    const roomLabel = room.charAt(0).toUpperCase() + room.slice(1).replace(/_/g, ' ')
    html += `<div style="margin-bottom:14px">`
    html += `<div style="background:#1e3a5f;color:#fff;padding:5px 10px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em">${roomLabel}</div>`
    html += `<table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-top:none">`
    for (const item of roomItems) {
      html += `<tr style="border-bottom:1px solid #f3f4f6">`
      html += `<td style="padding:7px 10px;color:#111827;width:38%"><strong>${item.name}</strong>`
      if (item.brand) html += ` <span style="color:#6b7280">(${item.brand})</span>`
      if (item.notes) html += `<br><span style="color:#9ca3af;font-size:11px">${item.notes}</span>`
      html += `</td>`
      html += `<td style="padding:7px 10px;color:#6b7280;width:20%">${item.type}</td>`
      html += `<td style="padding:7px 10px;width:22%"><span style="color:${statusColor(item.status)};font-weight:600">${item.status}</span></td>`
      html += `<td style="padding:7px 10px;text-align:right;color:#374151;width:20%">${item.value != null ? `£${Number(item.value).toLocaleString('en-GB')}` : '—'}</td>`
      html += `</tr>`
    }
    html += `</table></div>`
  }
  html += `</div>`
  return html
}

// Lazy import of DB + decrypt to avoid circular deps at module load
async function getSmtpConfig(): Promise<{
  host: string; port: number; user?: string; pass?: string; from: string
}> {
  try {
    const { prisma } = await import('./prisma')
    const { decrypt } = await import('./encrypt')
    const s = await prisma.systemSettings.findFirst()
    if (s?.isEmailConfigured && s.smtpHost && s.smtpUser && s.smtpPassEncrypted) {
      const from = s.emailFromName && s.emailFromAddress
        ? `${s.emailFromName} <${s.emailFromAddress}>`
        : s.emailFromAddress ?? s.smtpUser
      return {
        host: s.smtpHost,
        port: s.smtpPort ?? 587,
        user: s.smtpUser,
        pass: decrypt(s.smtpPassEncrypted),
        from,
      }
    }
  } catch {
    // DB unavailable or decryption failed — fall through to env vars
  }

  // Fallback: environment variables
  return {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM ?? 'FFA <noreply@ffa.law>',
  }
}

export type EmailEvent =
  | 'MAGIC_LINK'
  | 'SELLER_FORM_INVITE'
  | 'SELLER_FORM_SUBMITTED'
  | 'SELLER_PACK_SUBMITTED_AGENT'
  | 'BUYER_REVIEW_READY'
  | 'BUYER_ACCEPTED'
  | 'BUYER_ACCEPTED_ALL_PARTIES'
  | 'ENQUIRY_RAISED'
  | 'ENQUIRY_ANSWERED'
  | 'ENQUIRY_ROUTED_TO_SELLER'
  | 'ENQUIRY_COPY_TO_AGENT'
  | 'REJECTION_ROUTED_TO_SELLER'
  | 'REJECTION_COPY_TO_AGENT'
  | 'SELLER_REVISION_REQUESTED'
  | 'SELLER_REVISION_SUBMITTED'
  | 'DISTRIBUTION_COMPLETE'
  | 'RISK_FLAG_RAISED'
  | 'PDF_READY'
  | 'SELLER_REMINDER_7D'
  | 'SELLER_REMINDER_14D'
  | 'TRANSACTION_ASSIGNED_AGENT'
  | 'TRANSACTION_ASSIGNED_SOLICITOR'

interface EmailParams {
  to: string | string[]
  event: EmailEvent
  data: Record<string, string>
}

const SUBJECTS: Record<EmailEvent, string> = {
  MAGIC_LINK: 'Your FFA sign-in link',
  SELLER_FORM_INVITE: 'Please complete your Fixtures & Fittings form',
  SELLER_FORM_SUBMITTED: '[Legal] Fixtures & Fittings form submitted',
  SELLER_PACK_SUBMITTED_AGENT: '[FFA] Seller has completed the Fixtures & Fittings selling pack',
  BUYER_REVIEW_READY: '[Legal] Fixtures & Fittings form ready for your review',
  BUYER_ACCEPTED: '[Legal] Buyer has accepted the Fixtures & Fittings schedule',
  BUYER_ACCEPTED_ALL_PARTIES: '[Legal] Buyer acceptance confirmed — Fixtures & Fittings schedule agreed',
  ENQUIRY_RAISED: 'New enquiry raised on your transaction',
  ENQUIRY_ANSWERED: 'Your enquiry has been answered',
  ENQUIRY_ROUTED_TO_SELLER: '[Action Required] Buyer questions on your Fixtures & Fittings form',
  ENQUIRY_COPY_TO_AGENT: '[FYI] Buyer questions routed on transaction',
  REJECTION_ROUTED_TO_SELLER: '[Action Required] Buyer has rejected items on your Fixtures & Fittings form',
  REJECTION_COPY_TO_AGENT: '[FYI] Buyer rejections routed on transaction',
  SELLER_REVISION_REQUESTED: '[Action Required] Please revise your Fixtures & Fittings form',
  SELLER_REVISION_SUBMITTED: '[Legal] Revised Fixtures & Fittings form submitted',
  DISTRIBUTION_COMPLETE: '[Legal] Fixtures & Fittings schedule — Final distribution',
  RISK_FLAG_RAISED: '[Legal] Risk flag raised on fixtures item',
  PDF_READY: 'Your Fixtures & Fittings PDF is ready',
  SELLER_REMINDER_7D: 'Reminder: Please complete your Fixtures & Fittings form',
  SELLER_REMINDER_14D: 'Final reminder: Fixtures & Fittings form outstanding',
  TRANSACTION_ASSIGNED_AGENT: '[FFA] You have been assigned as Estate Agent on a transaction',
  TRANSACTION_ASSIGNED_SOLICITOR: '[FFA] You have been associated with a new property transaction',
}

function buildHtml(event: EmailEvent, data: Record<string, string>): string {
  const base = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1e3a5f;padding:20px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">FFA — Fixtures & Fittings Assurance</h1>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        BODY
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#6b7280;font-size:12px">
          This email was sent by FFA. If you did not expect this email, please contact your conveyancer.
        </p>
      </div>
    </div>
  `

  const bodies: Record<EmailEvent, string> = {
    MAGIC_LINK: `<p>Click the link below to sign in to FFA. This link is single-use and expires in 72 hours.</p>
      <p><a href="${data.url}" style="background:#1e3a5f;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Sign in to FFA</a></p>`,
    SELLER_FORM_INVITE: `<p>Dear ${data.sellerName},</p>
      <p>Your conveyancer has opened a Fixtures &amp; Fittings transaction for <strong>${data.address}</strong> (ref: ${data.reference}).</p>
      <p>Please complete the TA10 Fixtures &amp; Fittings form at the link below. Your responses will form part of the legal contract for the sale.</p>
      <p><a href="${data.url}" style="background:#1e3a5f;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Complete your F&amp;F form</a></p>`,
    SELLER_FORM_SUBMITTED: `${data.solicitorName ? `<p>Dear ${data.solicitorName},</p>` : ''}
      <p>The seller has completed and submitted the Fixtures &amp; Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}) on ${data.submittedAt}.</p>
      <p>A copy has been sent directly to the buyer. The full schedule is below for your records.</p>
      ${data.itemsTable ?? ''}`,
    SELLER_PACK_SUBMITTED_AGENT: `<p>Dear ${data.agentName},</p>
      <p>The seller has completed the Fixtures &amp; Fittings selling pack for <strong>${data.address}</strong> (ref: ${data.reference}) on ${data.submittedAt}.</p>
      <p>The pack is now being passed to the conveyancer for review. You will be notified of further updates as the transaction progresses.</p>`,
    BUYER_REVIEW_READY: `<p>Dear ${data.buyerName},</p>
      <p>The seller has completed the Fixtures &amp; Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}). The full schedule is below — please review each item and record your responses using the button below.</p>
      ${data.itemsTable ?? ''}
      <p style="margin-top:20px"><a href="${data.url}" style="background:#1e3a5f;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Review &amp; respond online</a></p>`,
    BUYER_ACCEPTED: `<p>The buyer has accepted the Fixtures &amp; Fittings schedule for <strong>${data.address}</strong> (ref: ${data.reference}) on ${data.acceptedAt}.</p>`,
    BUYER_ACCEPTED_ALL_PARTIES: `<p>The buyer has formally accepted the Fixtures &amp; Fittings schedule for <strong>${data.address}</strong> (ref: ${data.reference}) on ${data.acceptedAt}.</p>
      <p>All parties have been notified. The conveyancer will proceed with final distribution.</p>`,
    ENQUIRY_RAISED: `<p>A new enquiry has been raised on transaction <strong>${data.reference}</strong>:</p>
      <blockquote style="border-left:4px solid #e5e7eb;padding-left:16px;color:#374151">${data.question}</blockquote>`,
    ENQUIRY_ANSWERED: `<p>Your enquiry on transaction <strong>${data.reference}</strong> has been answered:</p>
      <blockquote style="border-left:4px solid #e5e7eb;padding-left:16px;color:#374151">${data.answer}</blockquote>`,
    ENQUIRY_ROUTED_TO_SELLER: `<p>Dear ${data.sellerName},</p>
      <p>The buyer has raised questions on your Fixtures &amp; Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}). Your conveyancer has reviewed and forwarded the following:</p>
      <p>${data.summary}</p>
      <p><a href="${data.url}" style="background:#1e3a5f;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Review &amp; revise your form</a></p>`,
    ENQUIRY_COPY_TO_AGENT: `<p>For your records — the buyer has raised questions on transaction <strong>${data.reference}</strong> (${data.address}). The conveyancer has routed these to the seller for revision.</p>`,
    REJECTION_ROUTED_TO_SELLER: `<p>Dear ${data.sellerName},</p>
      <p>The buyer has rejected ${data.count} item(s) on your Fixtures &amp; Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}). Your conveyancer has reviewed and forwarded these rejections.</p>
      <p><a href="${data.url}" style="background:#1e3a5f;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Review &amp; revise your form</a></p>`,
    REJECTION_COPY_TO_AGENT: `<p>For your records — the buyer has rejected ${data.count} item(s) on transaction <strong>${data.reference}</strong> (${data.address}). The conveyancer has routed these to the seller for revision.</p>`,
    SELLER_REVISION_REQUESTED: `<p>Dear ${data.sellerName},</p>
      <p>Your conveyancer has requested that you revise your Fixtures &amp; Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}).</p>
      <p>Reason: ${data.reason}</p>
      <p><a href="${data.url}" style="background:#1e3a5f;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Revise your form</a></p>`,
    SELLER_REVISION_SUBMITTED: `<p>The seller has submitted a revised Fixtures &amp; Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}) on ${data.submittedAt}. Please review and forward to the buyer.</p>`,
    DISTRIBUTION_COMPLETE: `<p>Dear ${data.recipientName},</p>
      <p>The final Fixtures &amp; Fittings schedule for <strong>${data.address}</strong> (ref: ${data.reference}) has been distributed and confirmed by the conveyancer on ${data.distributedAt}.</p>
      <p>The F&amp;F process is now complete.</p>`,
    RISK_FLAG_RAISED: `<p>A <strong>${data.riskLevel}</strong> risk flag has been raised on item <em>${data.itemDescription}</em> in transaction <strong>${data.reference}</strong>.</p>
      <p>Please review in the conveyancer dashboard.</p>`,
    PDF_READY: `<p>The Fixtures &amp; Fittings PDF for <strong>${data.address}</strong> (ref: ${data.reference}) is ready. It will be available for 24 hours.</p>
      <p><a href="${data.url}">Download PDF</a></p>`,
    SELLER_REMINDER_7D: `<p>Dear ${data.sellerName},</p>
      <p>This is a reminder that your Fixtures &amp; Fittings form for <strong>${data.address}</strong> is still outstanding.</p>
      <p><a href="${data.url}">Complete your form now</a></p>`,
    SELLER_REMINDER_14D: `<p>Dear ${data.sellerName},</p>
      <p><strong>Final reminder:</strong> Your Fixtures &amp; Fittings form for <strong>${data.address}</strong> has not been completed. Please act urgently.</p>
      <p><a href="${data.url}">Complete your form now</a></p>`,
    TRANSACTION_ASSIGNED_AGENT: `<p>Dear ${data.agentName},</p>
      <p>You have been assigned as the Estate Agent on a new Fixtures &amp; Fittings transaction for <strong>${data.address}</strong> (ref: ${data.reference}).</p>
      <p>The seller has been invited to complete the TA10 Fixtures &amp; Fittings form. You will be notified of updates as the transaction progresses.</p>`,
    TRANSACTION_ASSIGNED_SOLICITOR: `<p>Dear ${data.solicitorName},</p>
      <p>You have been associated with a new property transaction for <strong>${data.address}</strong> (ref: ${data.reference}) as the buyer's solicitor.</p>
      <p>The seller has been invited to complete the TA10 Fixtures &amp; Fittings form. You will receive further notifications as the transaction progresses.</p>`,
  }

  return base.replace('BODY', bodies[event])
}

export async function sendEmail(params: EmailParams): Promise<void> {
  const cfg = await getSmtpConfig()
  const to = Array.isArray(params.to) ? params.to.join(', ') : params.to
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: false },
  })
  try {
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject: SUBJECTS[params.event],
      html: buildHtml(params.event, params.data),
    })
    logger.info({ event: params.event, to: params.to }, 'Email sent')
  } catch (err) {
    logger.error({ err, event: params.event }, 'Email send failed')
    throw err
  }
}
