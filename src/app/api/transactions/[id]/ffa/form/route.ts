import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { ffaGetForm } from '@/lib/ffa-api'
import { NextRequest, NextResponse } from 'next/server'

export const GET = withRBAC('buyer_form:read', async (_req: NextRequest, { params }) => {
  const tx = await prisma.transaction.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { ffaSubmissionId: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!tx.ffaSubmissionId) {
    return NextResponse.json({ error: 'No external submission on record' }, { status: 404 })
  }

  try {
    const form = await ffaGetForm(tx.ffaSubmissionId)
    return NextResponse.json(form)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'get-form failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
