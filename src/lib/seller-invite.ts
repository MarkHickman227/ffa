import { createHash, randomBytes } from 'crypto'
import { prisma } from './prisma'
import { sendEmail } from './email'

export async function sendSellerFormInvite({
  sellerEmail,
  sellerName,
  transactionId,
  reference,
  address,
}: {
  sellerEmail: string
  sellerName: string
  transactionId: string
  reference: string
  address: string
}): Promise<void> {
  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
  const callbackUrl = `${appUrl}/seller/${transactionId}`

  const token = randomBytes(32).toString('hex')
  const hashedToken = createHash('sha256')
    .update(`${token}${process.env.NEXTAUTH_SECRET}`)
    .digest('hex')
  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000)

  await prisma.verificationToken.create({
    data: { identifier: sellerEmail, token: hashedToken, expires },
  })

  const params = new URLSearchParams({ callbackUrl, token, email: sellerEmail })
  const magicLink = `${appUrl}/api/auth/callback/email?${params}`

  await sendEmail({
    to: sellerEmail,
    event: 'SELLER_FORM_INVITE',
    data: { sellerName, address, reference, url: magicLink },
  })
}
