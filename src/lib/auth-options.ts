import { PrismaAdapter } from '@next-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import { TOTP } from 'otplib'
const totp = new TOTP()
import { writeAuditLog } from './audit'
import { logger } from './logger'
import { prisma } from './prisma'

const MAX_FAILED_LOGINS = 5
const LOCKOUT_MINUTES = 15

export const authOptions: AuthOptions = {
  adapter: {
    ...PrismaAdapter(prisma),
    getUserByEmail: (email: string) => prisma.user.findFirst({ where: { email } }),
  },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 hours
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
  },
  providers: [
    // Magic-link for SELLER and BUYER
    EmailProvider({
      server: {
        host: 'smtp.resend.com',
        port: 465,
        auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
      },
      from: process.env.EMAIL_FROM!,
      maxAge: 72 * 60 * 60, // 72 hours
      async sendVerificationRequest({ identifier, url }) {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: identifier,
          subject: 'Sign in to FFA',
          html: `<p>Click <a href="${url}">here</a> to sign in. This link expires in 72 hours and can only be used once.</p>`,
        })
        await writeAuditLog({ eventType: 'MAGIC_LINK_SENT', eventData: { email: identifier } })
      },
    }),

    // Credentials for CONVEYANCER / AGENT / ADMIN (email + password + TOTP)
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: 'Authenticator Code', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findFirst({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user || !user.passwordHash) {
          await writeAuditLog({ eventType: 'USER_LOGIN_FAILED', eventData: { email: credentials.email, reason: 'no_user' } })
          return null
        }

        // Check lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await writeAuditLog({ eventType: 'USER_LOGIN_FAILED', eventData: { email: credentials.email, reason: 'locked' }, userId: user.id })
          return null
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) {
          const failedLogins = user.failedLogins + 1
          const lockedUntil =
            failedLogins >= MAX_FAILED_LOGINS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
              : null
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLogins, lockedUntil },
          })
          await writeAuditLog({
            eventType: failedLogins >= MAX_FAILED_LOGINS ? 'USER_LOCKED' : 'USER_LOGIN_FAILED',
            userId: user.id,
            eventData: { email: credentials.email, failedLogins },
          })
          return null
        }

        // TOTP check for MFA-enabled users
        if (user.totpEnabled) {
          if (!credentials.totpCode) return null
          const valid = await totp.verify(credentials.totpCode, { secret: user.totpSecret! } as any)
          if (!valid) {
            await writeAuditLog({ eventType: 'USER_LOGIN_FAILED', userId: user.id, eventData: { reason: 'invalid_totp' } })
            return null
          }
        }

        // Reset failed logins on success
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: null },
        })

        const ip = (req as any)?.headers?.['x-forwarded-for'] ?? 'unknown'
        await writeAuditLog({
          eventType: 'USER_LOGIN',
          userId: user.id,
          eventData: { email: user.email, method: 'credentials' },
          ipAddress: typeof ip === 'string' ? ip.split(',')[0].trim() : 'unknown',
        })

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          firmId: user.firmId,
        }
      },
    }),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      try {
        const u = new URL(url)
        const b = new URL(baseUrl)
        if (u.hostname === b.hostname && u.port === b.port) return url
      } catch {}
      return `${baseUrl}/admin`
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.firmId = (user as any).firmId ?? null
      }
      // On sign-in via magic link, fetch role from DB
      if (trigger === 'signIn' && !token.role) {
        const dbUser = await prisma.user.findFirst({
          where: { email: token.email! },
          select: { id: true, role: true, firmId: true },
        })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
          token.firmId = dbUser.firmId ?? null
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).firmId = token.firmId
      }
      return session
    },
  },

  events: {
    async signOut({ token }) {
      await writeAuditLog({
        eventType: 'USER_LOGOUT',
        userId: token?.id as string | undefined,
        eventData: {},
      }).catch((e) => logger.error(e, 'signOut audit failed'))
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
}
