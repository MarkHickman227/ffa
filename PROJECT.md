# Project: FFA Platform

## What This App Does
FFA is a conveyancing digitisation platform for UK residential property transactions. It replaces paper-based TA10 (Fittings & Contents) forms with a digital workflow: conveyancers create transactions, sellers receive a magic-link invite and complete their TA10 form online, and the platform tracks status, documents, risk flags, and communications across all parties (conveyancer, agent, seller, buyer, buyer's solicitor).

## Tech Stack
- Frontend: Next.js 14 (App Router), Tailwind CSS
- Backend: Next.js API routes (no separate API server)
- Database: PostgreSQL via Prisma 5
- Auth: NextAuth.js — magic-link (email) for sellers/buyers, credentials + TOTP for conveyancers/agents/admin
- Email: Nodemailer for transactional SMTP (Hostinger), Resend API for magic-link auth
- Storage: AWS S3 (document uploads)
- Hosting: VPS at 168.231.114.133, Next.js standalone build, PM2 process manager

## Architecture
- Single Next.js monorepo — frontend and API routes together under `src/`
- PM2 runs the standalone build (`/var/www/ffa/.next/standalone/server.js`) as process #10
- Background workers in `/workers/` run as separate PM2 processes (email-sync, email-send, pdf-worker, webhook-worker)
- Deployed via git push → `npm ci` → `npm run build` → `pm2 restart ffa` on VPS
- Live at: `https://ffa.avaloncreativeltd.com`

## Key Decisions & Why
- NextAuth magic-link for sellers/buyers — they don't have passwords; one-click access via emailed link
- Credentials + TOTP for conveyancers/agents — professional staff need stronger auth
- SMTP config stored encrypted in `system_settings` DB table — admin can change without a deploy; encryption key in `SETTINGS_ENCRYPTION_KEY` env var
- JWT sessions (not database sessions) — stateless, 8-hour expiry
- `assertMutable()` guard on all mutation routes — prevents edits once a transaction reaches `EXCHANGE_COMPLETE` or `ARCHIVED`
- RBAC via `withRBAC()` wrapper on all API routes — permission strings like `conveyancer:manage`, `admin:all`

## File Structure
```
src/
  app/
    admin/          → Admin dashboard, transaction management, settings
    agent/          → Agent portal
    conveyancer/    → Conveyancer portal
    seller/         → Seller TA10 form
    buyer/          → Buyer portal
    email/          → In-app email client (three-pane UI)
    auth/           → Sign-in, verify, error pages
    api/            → All API route handlers
  lib/
    prisma.ts       → Prisma client singleton
    auth.ts / auth-options.ts → NextAuth config
    email.ts        → Transactional email (nodemailer, SMTP config from DB or env)
    seller-invite.ts → Seller form invite email logic
    rbac.ts         → withRBAC() middleware wrapper
    audit.ts        → Audit log writer
    encrypt.ts      → AES encryption for stored credentials
    s3.ts           → S3 upload/download helpers
    risk.ts         → Risk flag logic
    email/          → Email module helpers (crypto, sanitise, access-control)
workers/
  email-sync.ts     → IMAP sync worker
  email-send.ts     → Outbound queue worker
  pdf-worker.ts     → PDF generation worker
  webhook-worker.ts → Webhook delivery worker
prisma/
  schema.prisma     → Single source of truth for DB schema
```

## Conventions
- API routes: `/api/[resource]/[id]/[action]`
- Components: PascalCase, one per file
- All mutations guarded by `withRBAC()` + `assertMutable()`
- SMTP/email credentials encrypted at rest with AES via `src/lib/encrypt.ts`
- Audit log written for all significant events (login, transaction changes, emails sent)
- TypeScript strict mode — avoid `any`

## Current State
- ✅ Auth working (magic-link + credentials + TOTP)
- ✅ All 19 core tasks complete (transactions, TA10 forms, documents, risk, audit)
- ✅ In-app email client complete (IMAP sync, three-pane UI, send/reply)
- ✅ Seller invite email wired up (sent on transaction create and seller change)
- 🚧 Email SMTP broken — `SETTINGS_ENCRYPTION_KEY` was regenerated; DB-stored Hostinger password unreadable. Fix: re-enter password at `/admin/settings/email`
- ❌ Stripe not integrated

## Do Not Touch
- `prisma/schema.prisma` — run `prisma migrate dev` or `prisma db push` for any changes, never edit the DB directly
- `SETTINGS_ENCRYPTION_KEY` env var — regenerating it invalidates all encrypted credentials stored in the DB (SMTP password, mailbox passwords)
- The PM2 process names — workers are started by name; renaming breaks restart scripts
