import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">404 — Page Not Found</h1>
        <p className="text-gray-600 text-sm mb-6">The page you are looking for does not exist.</p>
        <Link href="/" className="text-blue-700 hover:underline text-sm">Return to home</Link>
      </div>
    </main>
  )
}
