import { UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from './auth-options'
import { prisma } from './prisma'

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
  | 'conveyancer:dismiss_risk'
  | 'conveyancer:export_pdf'
  | 'surveyor_access:grant'
  | 'surveyor_access:revoke'
  | 'agent:read'
  | 'agent:reconcile'
  | 'surveyor:read'
  | 'audit_log:read'
  | 'gdpr:sar'
  | 'gdpr:erasure'
  | 'admin:all'

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  [UserRole.SELLER]: [
    'transaction:read',
    'seller_form:read',
    'seller_form:write',
    'seller_form:submit',
  ],
  [UserRole.BUYER]: [
    'transaction:read',
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
    'conveyancer:dismiss_risk',
    'conveyancer:export_pdf',
    'surveyor_access:grant',
    'surveyor_access:revoke',
    'enquiry:answer',
    'enquiry:close',
  ],
  [UserRole.AGENT]: [
    'transaction:read',
    'seller_form:read',
    'agent:read',
    'agent:reconcile',
  ],
  [UserRole.SURVEYOR]: [
    'transaction:read',
    'seller_form:read',
    'surveyor:read',
  ],
  [UserRole.ADMIN]: [
    'transaction:read',
    'transaction:create',
    'seller_form:read',
    'buyer_form:read',
    'conveyancer:read',
    'conveyancer:dismiss_risk',
    'conveyancer:export_pdf',
    'surveyor_access:grant',
    'surveyor_access:revoke',
    'agent:read',
    'agent:reconcile',
    'surveyor:read',
    'audit_log:read',
    'gdpr:sar',
    'gdpr:erasure',
    'admin:all',
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
      surveyorAccess: {
        where: { surveyorUserId: user.id, revokedAt: null },
        select: { id: true },
      },
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
      return tx.conveyancerFirmId === user.firmId
    case UserRole.SURVEYOR:
      return tx.surveyorAccess.length > 0
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
