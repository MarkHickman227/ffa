import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSignedDownloadUrl } from '@/lib/s3'
import { redirect } from 'next/navigation'
import { PrintTrigger } from '@/components/PrintTrigger'
import { PrintButtons } from '@/components/PrintButtons'

export const dynamic = 'force-dynamic'

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 15mm; }
  @media print { .no-print { display: none !important; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  body { font-family: Arial, sans-serif !important; font-size: 11px; color: #111; background: #fff; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  th, td { border: 1px solid #ddd; padding: 5px 7px; vertical-align: top; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; font-size: 10px; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 12px; font-size: 10px; }
  .meta span { color: #666; }
  .photos { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .photos img { width: 70px; height: 55px; object-fit: cover; border: 1px solid #ddd; border-radius: 3px; }
  .risk { font-size: 9px; font-weight: 600; }
  .enquiry { border: 1px solid #ddd; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px; }
  .enq-q { font-weight: 600; margin-bottom: 3px; }
  .enq-a { background: #f9fafb; padding: 4px 6px; border-radius: 3px; margin-top: 3px; }
  .acceptance { background: #f0fdf4; border: 1px solid #86efac; padding: 10px 14px; border-radius: 4px; margin-top: 16px; }
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg); font-size: 120px; font-weight: 900; color: rgba(220,38,38,0.12); pointer-events: none; white-space: nowrap; z-index: 0; }
`

const STATUS_LABEL: Record<string, string> = {
  INCLUDED: 'Included', EXCLUDED: 'Excluded',
  NEGOTIABLE: 'Negotiable', REMOVED_PRIOR: 'Removed Prior', FOR_SALE: 'For Sale',
}
const STATUS_BG: Record<string, string> = {
  INCLUDED: '#dcfce7', EXCLUDED: '#fee2e2',
  NEGOTIABLE: '#fef9c3', REMOVED_PRIOR: '#f3f4f6', FOR_SALE: '#f3e8ff',
}
const RISK_COLOUR: Record<string, string> = {
  LOW: '#2563eb', MEDIUM: '#d97706', HIGH: '#dc2626',
}

async function trySignedUrl(key: string): Promise<string | null> {
  try { return await getSignedDownloadUrl(key, 7200) }
  catch { return null }
}

export default async function BuyerPrintPage({ params }: { params: { txId: string } }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const tx = await prisma.transaction.findUnique({
    where: { id: params.txId },
    include: {
      property: true,
      seller: true,
      buyer: true,
      fixturesItems: { where: { deletedAt: null }, orderBy: [{ room: 'asc' }, { sortOrder: 'asc' }] },
      enquiries: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!tx) return <div>Transaction not found</div>

  const itemsWithPhotos = await Promise.all(
    tx.fixturesItems.map(async (item) => {
      const signedUrls = (await Promise.all(
        (item.photoUrls as string[]).map(trySignedUrl)
      )).filter(Boolean) as string[]
      return { ...item, signedUrls }
    })
  )

  const rooms = [...new Set(itemsWithPhotos.map((i) => i.room))]
  const address = `${tx.property.addressLine1}${tx.property.addressLine2 ? ', ' + tx.property.addressLine2 : ''}, ${tx.property.city}, ${tx.property.postcode}`
  const printedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
  const acceptedAt = tx.buyerAcceptedAt
    ? new Date(tx.buyerAcceptedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    : null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PrintTrigger />
      <PrintButtons />

      {!tx.buyerAcceptedAt && <div className="watermark">DRAFT</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h1>TA10 Fixtures &amp; Fittings — Buyer Copy</h1>
          <div style={{ fontSize: 10, color: '#666' }}>Ref: {tx.reference} &nbsp;|&nbsp; Printed: {printedAt}</div>
        </div>
      </div>

      <div className="meta">
        <div><span>Property: </span>{address}</div>
        <div><span>Seller: </span>{tx.seller.firstName} {tx.seller.lastName}</div>
        {tx.buyer && <div><span>Buyer: </span>{tx.buyer.firstName} {tx.buyer.lastName}</div>}
        <div><span>Total items: </span>{itemsWithPhotos.length}</div>
      </div>

      {rooms.map((room) => {
        const roomItems = itemsWithPhotos.filter((i) => i.room === room)
        return (
          <div key={room}>
            <h2>{room}</h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>Description &amp; Photos</th>
                  <th style={{ width: '12%' }}>Status</th>
                  <th style={{ width: '10%' }}>Risk</th>
                  <th style={{ width: '10%' }}>Est. Value</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {roomItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div>{item.description}</div>
                      {item.signedUrls.length > 0 && (
                        <div className="photos">
                          {item.signedUrls.map((url, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={url} alt="" />
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ background: STATUS_BG[item.status] ?? '#f3f4f6' }}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>
                      {item.riskFlag !== 'NONE' && (
                        <span className="risk" style={{ color: RISK_COLOUR[item.riskFlag] ?? '#666' }}>
                          {item.riskFlag}
                        </span>
                      )}
                    </td>
                    <td>{item.estimatedValue ? `£${item.estimatedValue}` : '—'}</td>
                    <td style={{ fontSize: 10, fontStyle: 'italic', color: '#555' }}>{item.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {tx.enquiries.length > 0 && (
        <>
          <h2>Enquiries</h2>
          {tx.enquiries.map((enq) => (
            <div key={enq.id} className="enquiry">
              <div className="enq-q">Q: {enq.question}</div>
              {enq.answer && <div className="enq-a">A: {enq.answer}</div>}
              <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>
                Status: {enq.status} &nbsp;|&nbsp; {new Date(enq.createdAt).toLocaleDateString('en-GB')}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="acceptance">
        {acceptedAt ? (
          <>
            <strong style={{ color: '#15803d' }}>Schedule accepted by buyer</strong>
            <div style={{ fontSize: 10, marginTop: 4 }}>Accepted: {acceptedAt}</div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              I confirm that I have reviewed the fixtures and fittings list for this property and I formally accept
              this list as part of the contract for purchase. I understand that the items listed as included form
              part of my purchase and any items listed as excluded do not. I acknowledge that this acceptance has
              been recorded at the date and time shown and at the list version stated above.
            </div>
          </>
        ) : (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>Buyer acceptance pending</div>
        )}
      </div>
    </>
  )
}
