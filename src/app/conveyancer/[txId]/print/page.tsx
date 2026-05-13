import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSignedDownloadUrl } from '@/lib/s3'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function trySignedUrl(key: string): Promise<string | null> {
  try {
    return await getSignedDownloadUrl(key, 7200)
  } catch {
    return null
  }
}

const STATUS_LABEL: Record<string, string> = {
  INCLUDED: 'Included', EXCLUDED: 'Excluded',
  NEGOTIABLE: 'Negotiable', REMOVED_PRIOR: 'Removed Prior',
}
const STATUS_BG: Record<string, string> = {
  INCLUDED: '#dcfce7', EXCLUDED: '#fee2e2',
  NEGOTIABLE: '#fef9c3', REMOVED_PRIOR: '#f3f4f6',
}
const RISK_LABEL: Record<string, string> = {
  LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk',
}
const RISK_COLOUR: Record<string, string> = {
  LOW: '#2563eb', MEDIUM: '#d97706', HIGH: '#dc2626',
}

export default async function PrintPage({ params }: { params: { txId: string } }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/auth/signin')

  const tx = await prisma.transaction.findUnique({
    where: { id: params.txId },
    include: {
      property: true,
      seller: { select: { firstName: true, lastName: true } },
      buyer: { select: { firstName: true, lastName: true } },
      fixturesItems: {
        where: { deletedAt: null },
        orderBy: [{ room: 'asc' }, { sortOrder: 'asc' }],
      },
      legalAcknowledgements: { orderBy: { acknowledgedAt: 'desc' }, take: 1 },
      buyerAcceptances: { orderBy: { acceptedAt: 'desc' }, take: 1 },
    },
  })

  if (!tx) redirect('/conveyancer')

  // Resolve signed URLs for all item photos (2 h validity)
  const photoUrlsMap: Record<string, string[]> = {}
  for (const item of tx.fixturesItems) {
    if (item.photoUrls.length > 0) {
      const urls = await Promise.all(item.photoUrls.map(trySignedUrl))
      photoUrlsMap[item.id] = urls.filter(Boolean) as string[]
    }
  }

  const address = [tx.property.addressLine1, tx.property.addressLine2, tx.property.city, tx.property.postcode]
    .filter(Boolean).join(', ')

  const ack = tx.legalAcknowledgements[0]
  const acc = tx.buyerAcceptances[0]

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>TA10 — {tx.reference}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #111; background: #fff; }
          @page { size: A4; margin: 18mm 18mm 18mm 18mm; }
          @media print {
            .no-print { display: none !important; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .page-break { page-break-before: always; }
          }
          .no-print {
            position: fixed; top: 16px; right: 16px; z-index: 100;
            display: flex; gap: 8px;
          }
          .btn {
            background: #1e3a5f; color: #fff; border: none; cursor: pointer;
            padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;
          }
          .btn-outline {
            background: #fff; color: #1e3a5f; border: 2px solid #1e3a5f;
          }
          h1 { font-size: 17pt; color: #1e3a5f; margin-bottom: 10px; }
          h2 { font-size: 12pt; color: #1e3a5f; border-bottom: 2px solid #1e3a5f;
               padding-bottom: 3px; margin: 18px 0 8px 0; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px; margin-bottom: 14px; }
          .meta { font-size: 10pt; padding: 1px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: left; font-size: 9.5pt; }
          td { border: 1px solid #ddd; padding: 6px 8px; font-size: 9.5pt; vertical-align: top; }
          tr:nth-child(even) td { background: #f9fafb; }
          .room { font-weight: 600; white-space: nowrap; width: 14%; }
          .desc { width: 38%; }
          .photos { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
          .photos img { width: 110px; height: 80px; object-fit: cover;
                        border-radius: 3px; border: 1px solid #ccc; }
          .note { font-size: 8.5pt; color: #666; margin-top: 4px; font-style: italic; }
          .risk { font-size: 8.5pt; font-weight: 700; margin-top: 2px; }
          .legal-box { border: 1px solid #ccc; padding: 10px; border-radius: 4px;
                       font-size: 9pt; color: #444; line-height: 1.5; margin-bottom: 10px; }
          .legal-box p { margin: 3px 0; }
          .footer { font-size: 8pt; color: #888; margin-top: 24px;
                    border-top: 1px solid #e5e7eb; padding-top: 6px; }
        `}</style>
      </head>
      <body>
        {/* Print / Close buttons — hidden when printing */}
        <div className="no-print">
          <button className="btn" onClick={() => window.print()} suppressHydrationWarning>
            Print / Save as PDF
          </button>
          <button className="btn btn-outline" onClick={() => window.close()} suppressHydrationWarning>
            Close
          </button>
        </div>

        <h1>TA10 Fixtures and Fittings Schedule</h1>

        <div className="meta-grid">
          <p className="meta"><strong>Reference:</strong> {tx.reference}</p>
          <p className="meta"><strong>Generated:</strong> {new Date().toLocaleDateString('en-GB')}</p>
          <p className="meta"><strong>Property:</strong> {address}</p>
          <p className="meta"><strong>Status:</strong> {tx.status.replace(/_/g, ' ')}</p>
          <p className="meta"><strong>Seller:</strong> {tx.seller.firstName} {tx.seller.lastName}</p>
          <p className="meta"><strong>Buyer:</strong> {tx.buyer ? `${tx.buyer.firstName} ${tx.buyer.lastName}` : 'Not yet assigned'}</p>
          <p className="meta"><strong>Seller submitted:</strong> {tx.sellerSubmittedAt ? new Date(tx.sellerSubmittedAt).toLocaleDateString('en-GB') : 'Pending'}</p>
          <p className="meta"><strong>Buyer accepted:</strong> {tx.buyerAcceptedAt ? new Date(tx.buyerAcceptedAt).toLocaleDateString('en-GB') : 'Pending'}</p>
        </div>

        <h2>Fixtures &amp; Fittings Items</h2>
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Description &amp; Photos</th>
              <th>Type</th>
              <th>Status</th>
              <th>Est. Value</th>
            </tr>
          </thead>
          <tbody>
            {tx.fixturesItems.map((item) => {
              const photos = photoUrlsMap[item.id] ?? []
              return (
                <tr key={item.id}>
                  <td className="room">{item.room}</td>
                  <td className="desc">
                    <strong>{item.description}</strong>
                    {item.riskFlag !== 'NONE' && !item.riskFlagDismissedAt && (
                      <div className="risk" style={{ color: RISK_COLOUR[item.riskFlag] ?? '#666' }}>
                        ⚑ {RISK_LABEL[item.riskFlag] ?? item.riskFlag}
                      </div>
                    )}
                    {photos.length > 0 && (
                      <div className="photos">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {photos.map((url, i) => <img key={i} src={url} alt={`Photo ${i + 1}`} />)}
                      </div>
                    )}
                    {item.notes && <div className="note">Note: {item.notes}</div>}
                  </td>
                  <td>{item.itemType.replace(/_/g, ' ')}</td>
                  <td style={{ background: STATUS_BG[item.status] ?? '#f3f4f6' }}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </td>
                  <td>{item.estimatedValue ? `£${Number(item.estimatedValue).toFixed(2)}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {ack && (
          <>
            <h2>Seller Legal Acknowledgement</h2>
            <div className="legal-box">
              <p>{ack.legalText}</p>
              <p style={{ marginTop: 6 }}>
                <strong>Acknowledged by:</strong> {tx.seller.firstName} {tx.seller.lastName} &nbsp;|&nbsp;
                <strong>Date:</strong> {new Date(ack.acknowledgedAt).toLocaleDateString('en-GB')} &nbsp;|&nbsp;
                <strong>IP:</strong> {ack.ipAddress} &nbsp;|&nbsp;
                <strong>Version:</strong> {ack.formVersion}
              </p>
            </div>
          </>
        )}

        {acc && (
          <>
            <h2>Buyer Acceptance</h2>
            <div className="legal-box">
              <p>{acc.acceptanceText}</p>
              <p style={{ marginTop: 6 }}>
                <strong>Accepted by:</strong> {tx.buyer?.firstName} {tx.buyer?.lastName} &nbsp;|&nbsp;
                <strong>Date:</strong> {new Date(acc.acceptedAt).toLocaleDateString('en-GB')} &nbsp;|&nbsp;
                <strong>IP:</strong> {acc.ipAddress}
              </p>
            </div>
          </>
        )}

        <div className="footer">
          This document is produced under the TA10 protocol and is retained for 7 years per the Limitation Act 1980.
          Generated by FFA — Fixtures &amp; Fittings Assurance Platform.
        </div>

        {/* Auto-trigger print on open */}
        <script dangerouslySetInnerHTML={{ __html: 'window.onload = function(){ window.print(); }' }} />
      </body>
    </html>
  )
}
