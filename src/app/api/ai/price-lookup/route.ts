import { NextRequest, NextResponse } from 'next/server'
import { withRBAC } from '@/lib/rbac'
import { z } from 'zod'

const Schema = z.object({
  itemName: z.string().min(1).max(200),
  make: z.string().max(100).optional().default(''),
  model: z.string().max(200).optional().default(''),
})

export const POST = withRBAC('seller_form:read', async (req: NextRequest) => {
  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { itemName, make, model } = parsed.data
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'PERPLEXITY_API_KEY not configured' }, { status: 500 })
  }

  const nameMake = [make, itemName].filter(Boolean).join(' ')

  const prompt = `Search for the typical second-hand / resale value of this item in the UK (GBP).

**Name & Make:** ${nameMake}${model ? `\n**Model:** ${model}` : ''}

Respond ONLY in this exact format — no other text:
**Name & Make:** [item name]
**Description:** [brief spec/condition note, e.g. age range and key specs]
**Average Price:** £[low]-[high]`

  const resp = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.2,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    return NextResponse.json({ error: `Perplexity error: ${text}` }, { status: 502 })
  }

  const data = await resp.json()
  const content: string = data.choices?.[0]?.message?.content ?? ''

  // Extract the price range from "**Average Price:** £120-180"
  const priceMatch = content.match(/\*\*Average Price:\*\*\s*£([\d,]+)\s*[-–]\s*([\d,]+)/)
  const singleMatch = content.match(/\*\*Average Price:\*\*\s*£([\d,]+)/)

  let low: number | null = null
  let high: number | null = null
  let midpoint: number | null = null

  if (priceMatch) {
    low = parseInt(priceMatch[1].replace(/,/g, ''), 10)
    high = parseInt(priceMatch[2].replace(/,/g, ''), 10)
    midpoint = Math.round((low + high) / 2)
  } else if (singleMatch) {
    low = parseInt(singleMatch[1].replace(/,/g, ''), 10)
    high = low
    midpoint = low
  }

  return NextResponse.json({
    raw: content,
    low,
    high,
    midpoint,
    priceRange: low != null ? `£${low}–£${high}` : null,
  })
})
