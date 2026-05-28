export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getServerSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EmailSettingsForm } from './EmailSettingsForm'

export default async function EmailSettingsPage() {
  const session = await getServerSession()
  if (!session?.user || (session.user as any).role !== 'ADMIN') redirect('/admin')

  const s = await prisma.systemSettings.findFirst()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">

        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">Email Settings</span>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">Email Settings</h1>
        <p className="text-sm text-gray-500 mb-6">
          Configure the SMTP server used to send all notifications and form invitations.
          Settings are encrypted at rest and take effect immediately — no redeploy needed.
        </p>

        <EmailSettingsForm
          initial={{
            smtpHost:         s?.smtpHost         ?? '',
            smtpPort:         s?.smtpPort         ?? 587,
            smtpUser:         s?.smtpUser         ?? '',
            smtpPass:         s?.smtpPassEncrypted ? '***' : '',
            emailFromName:    s?.emailFromName    ?? '',
            emailFromAddress: s?.emailFromAddress ?? '',
            isEmailConfigured: s?.isEmailConfigured ?? false,
          }}
        />

      </div>
    </main>
  )
}
