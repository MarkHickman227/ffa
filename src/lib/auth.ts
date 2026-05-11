import { getServerSession as nextAuthGetServerSession } from 'next-auth'
import { authOptions } from './auth-options'
import type { SessionUser } from './rbac'

export async function getServerSession() {
  return nextAuthGetServerSession(authOptions)
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession()
  if (!session?.user) throw new Error('Unauthenticated')
  return session.user as SessionUser
}
