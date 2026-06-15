import nodemailer from 'nodemailer'
import { logger } from './logger'

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
    SELLER_FORM_SUBMITTED: `<p>The Fixtures &amp; Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}) has been submitted by the seller on ${data.submittedAt}.</p>
      <p>Please review and forward to the buyer when ready.</p>`,
    SELLER_PACK_SUBMITTED_AGENT: `<p>Dear ${data.agentName},</p>
      <p>The seller has completed the Fixtures &amp; Fittings selling pack for <strong>${data.address}</strong> (ref: ${data.reference}) on ${data.submittedAt}.</p>
      <p>The pack is now being passed to the conveyancer for review. You will be notified of further updates as the transaction progresses.</p>`,
    BUYER_REVIEW_READY: `<p>Dear ${data.buyerName},</p>
      <p>The Fixtures &amp; Fittings schedule for <strong>${data.address}</strong> (ref: ${data.reference}) has been forwarded to you by the conveyancer. Please review each item and respond.</p>
      <p><a href="${data.url}" style="background:#1e3a5f;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Review the schedule</a></p>`,
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
  const subject = SUBJECTS[params.event]
  const html = buildHtml(params.event, params.data)
  const to = Array.isArray(params.to) ? params.to : [params.to]

  // Prefer Resend API when available (same path as NextAuth magic-link emails)
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const from = process.env.EMAIL_FROM ?? 'FFA <noreply@ffa.law>'
    try {
      await resend.emails.send({ from, to, subject, html })
      logger.info({ event: params.event, to: params.to }, 'Email sent via Resend')
      return
    } catch (err) {
      logger.error({ err, event: params.event }, 'Resend send failed')
      throw err
    }
  }

  // Fall back to SMTP (nodemailer) when no Resend API key
  const cfg = await getSmtpConfig()
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: false },
  })
  try {
    await transporter.sendMail({ from: cfg.from, to: to.join(', '), subject, html })
    logger.info({ event: params.event, to: params.to }, 'Email sent via SMTP')
  } catch (err) {
    logger.error({ err, event: params.event }, 'Email send failed via SMTP')
    throw err
  }
}
