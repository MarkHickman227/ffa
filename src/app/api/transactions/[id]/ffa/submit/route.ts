import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { ffaSubmitForm, itemTypeToSdlt, prismaStatusToFfa, type FfaItem } from '@/lib/ffa-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSignedDownloadUrl } from '@/lib/s3'

export const POST = withRBAC('seller_form:submit', async (req: NextRequest, { params }) => {
  const tx = await prisma.transaction.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      property: { select: { addressLine1: true, postcode: true } },
      fixturesItems: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Map Prisma items → external API format
  const ffaItems: FfaItem[] = await Promise.all(
    tx.fixturesItems.map(async (item) => {
      // Attempt to get a signed URL for the first photo so the external API can display it
      let image: string | undefined
      if (item.photoUrls?.[0]) {
        try {
          // Extract the S3 key from the stored URL (may be a signed URL or a plain key)
          const key = item.photoUrls[0].startsWith('http')
            ? new URL(item.photoUrls[0]).pathname.slice(1)
            : item.photoUrls[0]
          image = await getSignedDownloadUrl(key, 3600)
        } catch (_) { /* non-fatal */ }
      }

      return {
        item_name: item.itemName,
        brand: item.make ?? '',
        model: item.model ?? '',
        estimated_value: item.estimatedValue ? Number(item.estimatedValue) : null,
        sdlt_sensitivity: itemTypeToSdlt(item.itemType),
        notes: item.notes ?? '',
        status: prismaStatusToFfa(item.status),
        room: item.room,
        ...(image ? { image } : {}),
      }
    }),
  )

  const propertyRef = `${tx.property.addressLine1} ${tx.property.postcode}`.trim() || tx.reference

  let submissionId: string | null = null
  let ffaError: string | null = null

  try {
    const result = await ffaSubmitForm(propertyRef, ffaItems)
    submissionId = result.submission_id
  } catch (err) {
    ffaError = err instanceof Error ? err.message : 'External submit failed'
  }

  // Persist submission ID even if the seller form submit continues
  if (submissionId) {
    await prisma.transaction.update({
      where: { id: params.id },
      data: { ffaSubmissionId: submissionId },
    })
  }

  return NextResponse.json({
    ok: true,
    submissionId,
    ...(ffaError ? { ffaError } : {}),
  })
})
