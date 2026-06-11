import { prisma } from '@/lib/prisma'
import { withRBAC } from '@/lib/rbac'
import { ffaSubmitForm, type FfaItem } from '@/lib/ffa-api'
import { NextRequest, NextResponse } from 'next/server'

export const POST = withRBAC('seller_form:submit', async (req: NextRequest, { params }) => {
  const body = await req.json()
  const { property_reference, items } = body as { property_reference?: string; items?: FfaItem[] }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items required' }, { status: 400 })
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { reference: true },
  })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const propRef = property_reference?.trim() || tx.reference

  const result = await ffaSubmitForm(propRef, items).catch(err => {
    throw new Error(err instanceof Error ? err.message : 'submit failed')
  })

  await prisma.transaction.update({
    where: { id: params.id },
    data: { ffaSubmissionId: result.submission_id },
  })

  return NextResponse.json({ submission_id: result.submission_id })
})
