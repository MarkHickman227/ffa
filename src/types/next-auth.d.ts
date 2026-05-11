import { UserRole } from '@prisma/client'
import NextAuth, { DefaultSession, DefaultJWT } from 'next-auth'
import { JWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      firmId: string | null
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: UserRole
    firmId?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    firmId: string | null
  }
}
