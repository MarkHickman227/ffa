import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { uploadToS3, getSignedDownloadUrl } from '@/lib/s3'
import { identifyFromImageUrl } from '@/lib/serpapi'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export const POST = withRBAC('seller_form:write', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const { photoDataUrl, itemName } = body as { photoDataUrl?: string; itemName?: string }

  if (!photoDataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Valid image data URL required' }, { status: 400 })
  }

  const tx = await prisma.transaction.findUnique({ where: { id: params.id } })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Upload to S3 so SerpAPI can fetch it via a signed URL
  const base64Data = photoDataUrl.split(',')[1]
  const buffer = Buffer.from(base64Data, 'base64')
  const s3Key = `transactions/${params.id}/smart-capture/${randomUUID()}.jpg`
  await uploadToS3(s3Key, buffer, 'image/jpeg')
  const signedUrl = await getSignedDownloadUrl(s3Key, 3600)

  // Identify via SerpAPI Google Lens — non-fatal if not configured
  let identifiedName = itemName ?? ''
  let make = ''
  let model = ''
  try {
    const id = await identifyFromImageUrl(signedUrl)
    if (id.identifiedName) identifiedName = id.identifiedName
    make = id.make
    model = id.model
  } catch (_) { /* proceed with empty identification */ }

  // Price lookup via Perplexity — non-fatal
  let priceLow: number | null = null
  let priceHigh: number | null = null
  let priceMid: number | null = null
  let priceRange: string | null = null

  if (identifiedName && process.env.PERPLEXITY_API_KEY) {
    try {
      const query = [make, identifiedName].filter(Boolean).join(' ')
      const prompt = `Search for the typical second-hand / resale value of this item in the UK (GBP).\n\n**Name & Make:** ${query}${model ? `\n**Model:** ${model}` : ''}\n\nRespond ONLY in this exact format — no other text:\n**Name & Make:** [item name]\n**Description:** [brief spec/condition note, e.g. age range and key specs]\n**Average Price:** £[low]-[high]`

      const priceRes = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.2,
        }),
      })

      if (priceRes.ok) {
        const pd = await priceRes.json()
        const content: string = pd.choices?.[0]?.message?.content ?? ''
        const rm = content.match(/\*\*Average Price:\*\*\s*£([\d,]+)\s*[-–]\s*([\d,]+)/)
        const sm = content.match(/\*\*Average Price:\*\*\s*£([\d,]+)/)
        if (rm) {
          priceLow = parseInt(rm[1].replace(/,/g, ''), 10)
          priceHigh = parseInt(rm[2].replace(/,/g, ''), 10)
          priceMid = Math.round((priceLow + priceHigh) / 2)
          priceRange = `£${priceLow}–£${priceHigh}`
        } else if (sm) {
          priceLow = priceHigh = priceMid = parseInt(sm[1].replace(/,/g, ''), 10)
          priceRange = `£${priceLow}`
        }
      }
    } catch (_) { /* non-fatal */ }
  }

  return NextResponse.json({ identifiedName, make, model, priceLow, priceHigh, priceMid, priceRange })
})
