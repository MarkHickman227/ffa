import { prisma } from './prisma'
import { logger } from './logger'

export type AuditEventType =
  // Auth
  | 'USER_LOGIN'
  | 'USER_LOGIN_FAILED'
  | 'USER_LOCKED'
  | 'USER_LOGOUT'
  | 'MAGIC_LINK_SENT'
  | 'MAGIC_LINK_USED'
  // Transaction
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_STATUS_CHANGED'
  // Seller
  | 'SELLER_FORM_STARTED'
  | 'SELLER_FORM_AUTO_SAVED'
  | 'SELLER_FORM_SUBMITTED'
  | 'FIXTURES_ITEM_CREATED'
  | 'FIXTURES_ITEM_UPDATED'
  | 'FIXTURES_ITEM_DELETED'
  | 'LEGAL_ACKNOWLEDGEMENT_RECORDED'
  // Buyer
  | 'ENQUIRY_RAISED'
  | 'ENQUIRY_ANSWERED'
  | 'ENQUIRY_CLOSED'
  | 'BUYER_ACCEPTED'
  // Conveyancer
  | 'RISK_FLAG_DISMISSED'
  | 'PDF_EXPORT_REQUESTED'
  | 'PDF_EXPORT_COMPLETE'
  | 'SURVEYOR_ACCESS_GRANTED'
  | 'SURVEYOR_ACCESS_REVOKED'
  // Agent
  | 'RECONCILIATION_RUN'
  | 'RECONCILIATION_CONFLICT_FLAGGED'
  // GDPR
  | 'SAR_REQUESTED'
  | 'ERASURE_REQUESTED'
  // System
  | 'WEBHOOK_DELIVERY_FAILED'
  | 'RETENTION_PURGE_RUN'

interface AuditParams {
  eventType: AuditEventType
  transactionId?: string
  userId?: string
  eventData?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        eventType: params.eventType,
        transactionId: params.transactionId ?? null,
        userId: params.userId ?? null,
        eventData: (params.eventData ?? {}) as object,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    })
  } catch (err) {
    // Non-blocking — log failure but never throw
    logger.error({ err, params }, 'AuditLog write failed')
  }
}
