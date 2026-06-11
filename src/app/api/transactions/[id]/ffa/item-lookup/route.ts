import { withRBAC } from '@/lib/rbac'
import { ffaItemLookup } from '@/lib/ffa-api'
import { NextRequest, NextResponse } from 'next/server'

export const POST = withRBAC('seller_form:write', async (req: NextRequest) => {
  const body = await req.json()
  const { photoDataUrl, ta10Category } = body as { photoDataUrl?: string; ta10Category?: string }

  if (!photoDataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Valid image data URL required' }, { status: 400 })
  }

  const base64 = photoDataUrl.split(',')[1]

  try {
    const result = await ffaItemLookup(base64, ta10Category)
    console.log('FFA API raw response:', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as Error
    console.error('FFA API error:', e.message, e.stack)
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
})
