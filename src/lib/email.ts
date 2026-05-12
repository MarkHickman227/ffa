import { Resend } from 'resend'
import { logger } from './logger'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}
const FROM = process.env.EMAIL_FROM ?? 'FFA <noreply@ffa.law>'

export type EmailEvent =
  | 'MAGIC_LINK'
  | 'SELLER_FORM_INVITE'
  | 'SELLER_FORM_SUBMITTED'        // legally material — cannot opt out
  | 'BUYER_REVIEW_READY'           // legally material — cannot opt out
  | 'BUYER_ACCEPTED'               // legally material — cannot opt out
  | 'ENQUIRY_RAISED'
  | 'ENQUIRY_ANSWERED'
  | 'RISK_FLAG_RAISED'             // legally material — cannot opt out
  | 'PDF_READY'
  | 'SELLER_REMINDER_7D'
  | 'SELLER_REMINDER_14D'

interface EmailParams {
  to: string | string[]
  event: EmailEvent
  data: Record<string, string>
}

const SUBJECTS: Record<EmailEvent, string> = {
  MAGIC_LINK: 'Your FFA sign-in link',
  SELLER_FORM_INVITE: 'Please complete your Fixtures & Fittings form',
  SELLER_FORM_SUBMITTED: '[Legal] Fixtures & Fittings form submitted',
  BUYER_REVIEW_READY: '[Legal] Fixtures & Fittings form ready for your review',
  BUYER_ACCEPTED: '[Legal] Buyer has accepted the Fixtures & Fittings schedule',
  ENQUIRY_RAISED: 'New enquiry raised on your transaction',
  ENQUIRY_ANSWERED: 'Your enquiry has been answered',
  RISK_FLAG_RAISED: '[Legal] Risk flag raised on fixtures item',
  PDF_READY: 'Your Fixtures & Fittings PDF is ready',
  SELLER_REMINDER_7D: 'Reminder: Please complete your Fixtures & Fittings form',
  SELLER_REMINDER_14D: 'Final reminder: Fixtures & Fittings form outstanding',
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
      <p>Your conveyancer has invited you to complete the TA10 Fixtures & Fittings form for <strong>${data.address}</strong>.</p>
      <p><a href="${data.url}">Complete your form</a></p>`,
    SELLER_FORM_SUBMITTED: `<p>The Fixtures & Fittings form for <strong>${data.address}</strong> (ref: ${data.reference}) has been submitted by the seller on ${data.submittedAt}.</p>
      <p>Please review and share with the buyer's conveyancer.</p>`,
    BUYER_REVIEW_READY: `<p>Dear ${data.buyerName},</p>
      <p>The seller has completed the Fixtures & Fittings schedule for <strong>${data.address}</strong> (ref: ${data.reference}). Please review and respond.</p>
      <p><a href="${data.url}">Review the schedule</a></p>`,
    BUYER_ACCEPTED: `<p>The buyer has accepted the Fixtures & Fittings schedule for <strong>${data.address}</strong> (ref: ${data.reference}) on ${data.acceptedAt}.</p>`,
    ENQUIRY_RAISED: `<p>A new enquiry has been raised on transaction <strong>${data.reference}</strong>:</p>
      <blockquote style="border-left:4px solid #e5e7eb;padding-left:16px;color:#374151">${data.question}</blockquote>`,
    ENQUIRY_ANSWERED: `<p>Your enquiry on transaction <strong>${data.reference}</strong> has been answered:</p>
      <blockquote style="border-left:4px solid #e5e7eb;padding-left:16px;color:#374151">${data.answer}</blockquote>`,
    RISK_FLAG_RAISED: `<p>A <strong>${data.riskLevel}</strong> risk flag has been raised on item <em>${data.itemDescription}</em> in transaction <strong>${data.reference}</strong>.</p>
      <p>Please review in the conveyancer dashboard.</p>`,
    PDF_READY: `<p>The Fixtures & Fittings PDF for <strong>${data.address}</strong> (ref: ${data.reference}) is ready. It will be available for 24 hours.</p>
      <p><a href="${data.url}">Download PDF</a></p>`,
    SELLER_REMINDER_7D: `<p>Dear ${data.sellerName},</p>
      <p>This is a reminder that your Fixtures & Fittings form for <strong>${data.address}</strong> is still outstanding.</p>
      <p><a href="${data.url}">Complete your form now</a></p>`,
    SELLER_REMINDER_14D: `<p>Dear ${data.sellerName},</p>
      <p><strong>Final reminder:</strong> Your Fixtures & Fittings form for <strong>${data.address}</strong> has not been completed. Please act urgently.</p>
      <p><a href="${data.url}">Complete your form now</a></p>`,
  }

  return base.replace('BODY', bodies[event])
}

export async function sendEmail(params: EmailParams): Promise<void> {
  try {
    await getResend().emails.send({
      from: FROM,
      to: params.to,
      subject: SUBJECTS[params.event],
      html: buildHtml(params.event, params.data),
    })
    logger.info({ event: params.event, to: params.to }, 'Email sent')
  } catch (err) {
    logger.error({ err, event: params.event }, 'Email send failed')
    throw err
  }
}
