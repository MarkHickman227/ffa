import { prisma } from './prisma'
import { NextResponse } from 'next/server'

const LOCKED_STATUSES = ['EXCHANGE_COMPLETE', 'ARCHIVED']

/**
 * Returns null when the transaction is mutable.
 * Returns a 409 NextResponse when it is locked (complete/archived).
 * Returns a 404 NextResponse when the transaction does not exist.
 */
export async function assertMutable(transactionId: string): Promise<NextResponse | null> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { status: true },
  })
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  if (LOCKED_STATUSES.includes(tx.status)) {
    return NextResponse.json(
      { error: 'This transaction is complete and cannot be modified' },
      { status: 409 },
    )
  }
  return null
}
