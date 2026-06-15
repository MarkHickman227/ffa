import { UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from './auth-options'
import { prisma } from './prisma'
import { verifySellerToken } from './seller-access'

const SELLER_TOKEN_ACTIONS: Action[] = [
  'transaction:read',
  'seller_form:read',
  'seller_form:write',
  'seller_form:submit',
]

// ─── Permission Matrix ─────────────────────────────────────────────────────

export type Action =
  | 'transaction:read'
  | 'transaction:create'
  | 'seller_form:read'
  | 'seller_form:write'
  | 'seller_form:submit'
  | 'buyer_form:read'
  | 'buyer_form:accept'
  | 'enquiry:raise'
  | 'enquiry:answer'
  | 'enquiry:close'
  | 'conveyancer:read'
  | 'conveyancer:manage'
  | 'conveyancer:dismiss_risk'
  | 'conveyancer:export_pdf'
  | 'agent:read'
  | 'agent:reconcile'
  | 'audit_log:read'
  | 'gdpr:sar'
  | 'gdpr:erasure'
  | 'admin:all'
  | 'email:read'
  | 'email:send'
  | 'email:manage'

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  [UserRole.SELLER]: [
    'transaction:read',
    'seller_form:read',
    'seller_form:write',
    'seller_form:submit',
  ],
  [UserRole.BUYER]: [
    'transaction:read',
    'seller_form:read',
    'buyer_form:read',
    'buyer_form:accept',
    'enquiry:raise',
    'enquiry:close',
  ],
  [UserRole.CONVEYANCER]: [
    'transaction:read',
    'transaction:create',
    'seller_form:read',
    'buyer_form:read',
    'conveyancer:read',
    'conveyancer:manage',
    'conveyancer:dismiss_risk',
    'conveyancer:export_pdf',
    'enquiry:answer',
    'enquiry:close',
    'email:read',
    'email:send',
    'email:manage',
  ],
  [UserRole.AGENT]: [
    'transaction:read',
    'seller_form:read',
    'agent:read',
    'agent:reconcile',
    'enquiry:answer',
    'email:read',
  ],
  [UserRole.ADMIN]: [
    'transaction:read',
    'transaction:create',
    'seller_form:read',
    'seller_form:write',
    'seller_form:submit',
    'buyer_form:read',
    'buyer_form:accept',
    'conveyancer:read',
    'conveyancer:manage',
    'conveyancer:dismiss_risk',
    'conveyancer:export_pdf',
    'agent:read',
    'agent:reconcile',
    'audit_log:read',
    'gdpr:sar',
    'gdpr:erasure',
    'admin:all',
    'email:read',
    'email:send',
    'email:manage',
  ],
  [UserRole.BUYER_SOLICITOR]: [
    'transaction:read',
    'seller_form:read',
    'buyer_form:read',
    'conveyancer:read',
    'enquiry:raise',
    'enquiry:answer',
    'enquiry:close',
  ],
  [UserRole.SYSTEM]: ['admin:all'],
}

export interface SessionUser {
  id: string
  email: string
  role: UserRole
  firmId?: string | null
}

export function hasPermission(user: SessionUser, action: Action): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(action) ?? false
}

/**
 * Check the user has the given action AND is a member of the transaction
 * (or has admin/conveyancer role which bypasses membership).
 */
export async function checkPermission(
  user: SessionUser,
  action: Action,
  transactionId?: string,
): Promise<boolean> {
  if (!hasPermission(user, action)) return false
  if (!transactionId) return true
  if (user.role === UserRole.ADMIN || user.role === UserRole.SYSTEM) return true

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      sellerId: true,
      buyerId: true,
      conveyancerFirmId: true,
    },
  })
  if (!tx) return false

  switch (user.role) {
    case UserRole.SELLER:
      return tx.sellerId === user.id
    case UserRole.BUYER:
      return tx.buyerId === user.id
    case UserRole.CONVEYANCER:
      return tx.conveyancerFirmId === user.firmId
    case UserRole.AGENT:
      return true
    default:
      return false
  }
}

type RouteHandler = (
  req: NextRequest,
  context: { params: Record<string, string> },
) => Promise<NextResponse>

export function withRBAC(action: Action, handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    // Seller direct-link bypass: token in x-seller-token header grants access
    // to seller_form and transaction:read actions for the matching transaction.
    if (SELLER_TOKEN_ACTIONS.includes(action)) {
      const token = req.headers.get('x-seller-token')
      const txId = context.params?.id as string | undefined
      if (token && txId && verifySellerToken(token, txId)) {
        return handler(req, context)
      }
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = session.user as SessionUser
    const transactionId = context.params?.id as string | undefined

    const allowed = await checkPermission(user, action, transactionId)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return handler(req, context)
  }
}
