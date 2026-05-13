import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSignedDownloadUrl } from '@/lib/s3'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function trySignedUrl(key: string): Promise<string | null> {
  try { return await getSignedDownloadUrl(key, 7200) }
  catch { return null }
}

const STATUS_LABEL: Record<string, string> = {
  INCLUDED: 'Included', EXCLUDED: 'Excluded',
  NEGOTIABLE: 'Negotiable', REMOVED_PRIOR: 'Removed Prior',
}
const STATUS_BG: Record<string, string> = {
  INCLUDED: '#dcfce7', EXCLUDED: '#fee2e2',
  NEGOTIABLE: '#fef9c3', REMOVED_PRIOR: '#f3f4f6',
}
const RISK_COLOUR: Record<string, string> = {
  LOW: '#2563eb', MEDIUM: '#d97706', HIGH: '#dc2626',
}

export default async function SellerPrintPage({ params }: { params: { txId: string } }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const tx = await prisma.transaction.findUnique({
    where: { id: params.txId },
    include: {
      property: true,
      seller: true,
      buyer: true,
      fixturesItems: { where: { deletedAt: null }, orderBy: [{ room: 'asc' }, { sortOrder: 'asc' }] },
    },
  })
  if (!tx) return <div>Transaction not found</div>

  // Resolve signed URLs for photos
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

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>TA10 Fixtures & Fittings — {tx.reference}</title>
        <style>{`
          @page { size: A4; margin: 18mm 15mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
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
          .no-print { }
          @media print { .no-print { display: none !important; } }
          .legal { background: #fffbeb; border: 1px solid #fde68a; padding: 8px 12px; border-radius: 4px; font-size: 10px; margin-top: 16px; }
          .risk { font-size: 9px; font-weight: 600; }
          .sig-line { border-top: 1px solid #aaa; margin-top: 28px; padding-top: 4px; width: 60%; font-size: 10px; color: #666; }
          .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg);
            font-size: 120px; font-weight: 900; color: rgba(220,38,38,0.12); pointer-events: none;
            white-space: nowrap; z-index: 0; }
        `}</style>
      </head>
      <body>
        {tx.status === 'DRAFT' || tx.status === 'SELLER_FORM_IN_PROGRESS' ? <div className="watermark">DRAFT</div> : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <h1>TA10 Fixtures &amp; Fittings</h1>
            <div style={{ fontSize: 10, color: '#666' }}>Ref: {tx.reference} &nbsp;|&nbsp; Printed: {printedAt}</div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ padding: '6px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              Print / Save as PDF
            </button>
            <button onClick={() => window.close()} style={{ padding: '6px 14px', background: '#f3f4f6', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              Close
            </button>
          </div>
        </div>

        <div className="meta">
          <div><span>Property: </span>{address}</div>
          <div><span>Seller: </span>{tx.seller.firstName} {tx.seller.lastName}</div>
          <div><span>Total items: </span>{itemsWithPhotos.length}</div>
          <div><span>Status: </span>{tx.status.replace(/_/g, ' ')}</div>
        </div>

        {rooms.map((room) => {
          const roomItems = itemsWithPhotos.filter((i) => i.room === room)
          return (
            <div key={room}>
              <h2>{room}</h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Description &amp; Photos</th>
                    <th style={{ width: '15%' }}>Type</th>
                    <th style={{ width: '12%' }}>Status</th>
                    <th style={{ width: '10%' }}>Risk</th>
                    <th style={{ width: '12%' }}>Est. Value</th>
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
                      <td style={{ fontSize: 9 }}>{item.itemType.replace(/_/g, ' ')}</td>
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

        <div className="legal">
          <strong>Seller Declaration: </strong>
          I confirm that the information I have provided in this fixtures and fittings form is accurate and complete
          to the best of my knowledge and belief. I understand that this information will form part of the contract
          for the sale of the property and that I may be legally liable for any inaccuracies. I acknowledge that
          this declaration has been made at the date and time recorded by the platform and from the device
          identified by my IP address.
        </div>

        <div className="sig-line">Seller signature &amp; date</div>

        <script dangerouslySetInnerHTML={{ __html: 'window.onload = function(){ window.print(); }' }} />
      </body>
    </html>
  )
}
