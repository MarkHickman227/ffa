import { createHmac } from 'crypto'

export function generateSellerToken(txId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(`seller-form-access-v1:${txId}`)
    .digest('hex')
}

export function verifySellerToken(token: string, txId: string): boolean {
  if (!token || !txId || !process.env.NEXTAUTH_SECRET) return false
  return token === generateSellerToken(txId)
}

export function generateBuyerToken(txId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(`buyer-form-access-v1:${txId}`)
    .digest('hex')
}

export function verifyBuyerToken(token: string, txId: string): boolean {
  if (!token || !txId || !process.env.NEXTAUTH_SECRET) return false
  return token === generateBuyerToken(txId)
}
