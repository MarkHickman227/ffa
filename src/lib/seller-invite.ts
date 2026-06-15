import { generateSellerToken } from './seller-access'
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
  const token = generateSellerToken(transactionId)
  const url = `${appUrl}/seller/${transactionId}?token=${token}`

  await sendEmail({
    to: sellerEmail,
    event: 'SELLER_FORM_INVITE',
    data: { sellerName, address, reference, url },
  })
}
