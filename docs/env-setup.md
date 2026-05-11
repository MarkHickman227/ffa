# Environment Setup

## Quick start (local dev)

```bash
cp .env.example .env.local
docker compose up -d          # start postgres + redis
npm run db:push               # push prisma schema (skips migrations)
npm run db:seed               # seed test data
npm run dev                   # start Next.js dev server
```

In a second terminal:
```bash
npm run worker                # start PDF export worker
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `NEXTAUTH_URL` | Yes | Full URL of your app (e.g. https://ffa.example.com) |
| `NEXTAUTH_SECRET` | Yes | Random 32+ char secret for JWT signing |
| `RESEND_API_KEY` | Yes | Resend API key for transactional email |
| `EMAIL_FROM` | Yes | Sender address shown in emails |
| `AWS_ACCESS_KEY_ID` | Yes | AWS IAM access key (eu-west-2 only) |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS IAM secret |
| `AWS_S3_BUCKET` | Yes | S3 bucket name (must be in eu-west-2) |
| `SENTRY_DSN` | Prod only | Sentry DSN for error tracking |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |
| `APP_VERSION` | No | Shown in /api/health response |

## Railway deployment

1. Create a Railway project and add PostgreSQL and Redis services
2. Set all environment variables in the Railway dashboard
3. Connect your GitHub repository
4. Railway auto-deploys on push to `main`
5. After first deploy, run migrations: `railway run npm run db:migrate`
6. Deploy the PDF worker as a separate Railway service with start command: `npm run worker`

## S3 bucket requirements

- Region: **eu-west-2** (London) — data residency requirement (UK GDPR)
- Versioning: enabled
- Server-side encryption: SSE-S3 or SSE-KMS
- Block all public access: enabled
- CORS: allow GET from your app domain
