export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import IORedis from 'ioredis'

interface HealthStatus {
  status: 'ok' | 'degraded' | 'down'
  db: 'ok' | 'down'
  redis: 'ok' | 'down'
  s3: 'ok' | 'down'
  timestamp: string
  version: string
}

async function checkDb(): Promise<'ok' | 'down'> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'ok'
  } catch {
    return 'down'
  }
}

async function checkRedis(): Promise<'ok' | 'down'> {
  try {
    const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    })
    await redis.ping()
    await redis.quit()
    return 'ok'
  } catch {
    return 'down'
  }
}

async function checkS3(): Promise<'ok' | 'down'> {
  try {
    const s3 = new S3Client({ region: 'eu-west-2' })
    await s3.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET! }))
    return 'ok'
  } catch {
    return 'down'
  }
}

export async function GET() {
  const [db, redis, s3] = await Promise.all([checkDb(), checkRedis(), checkS3()])

  const status: HealthStatus['status'] =
    db === 'down' || redis === 'down' ? 'down' : s3 === 'down' ? 'degraded' : 'ok'

  const body: HealthStatus = {
    status,
    db,
    redis,
    s3,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? 'unknown',
  }

  logger.info(body, 'health check')

  const httpStatus = db === 'down' || redis === 'down' ? 503 : 200
  return NextResponse.json(body, { status: httpStatus })
}
