import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token as any

    if (!token) return NextResponse.redirect(new URL('/auth/signin', req.url))

    const role = token.role

    // Role-based route guards
    if (pathname.startsWith('/seller') && role !== 'SELLER' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/auth/unauthorized', req.url))
    }
    if (pathname.startsWith('/buyer') && role !== 'BUYER' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/auth/unauthorized', req.url))
    }
    if (pathname.startsWith('/conveyancer') && role !== 'CONVEYANCER' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/auth/unauthorized', req.url))
    }
    if (pathname.startsWith('/agent') && role !== 'AGENT' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/auth/unauthorized', req.url))
    }
    if (pathname.startsWith('/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/auth/unauthorized', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
)

export const config = {
  matcher: [
    '/seller',
    '/seller/:path*',
    '/buyer',
    '/buyer/:path*',
    '/conveyancer',
    '/conveyancer/:path*',
    '/agent',
    '/agent/:path*',
    '/admin',
    '/admin/:path*',
    '/api/transactions/:path*',
    '/api/gdpr/:path*',
    '/api/admin/:path*',
  ],
}
