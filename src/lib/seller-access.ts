import { createHmac } from 'crypto'

const SCOPE = 'seller-form-access-v1'

export function generateSellerToken(txId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(`${SCOPE}:${txId}`)
    .digest('hex')
}

export function verifySellerToken(token: string, txId: string): boolean {
  if (!token || !txId || !process.env.NEXTAUTH_SECRET) return false
  return token === generateSellerToken(txId)
}
