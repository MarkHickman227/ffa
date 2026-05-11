import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-xl shadow p-8">
        <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-6">
          <span className="text-white font-bold text-lg">FFA</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Fixtures & Fittings Assurance</h1>
        <p className="text-gray-600 mb-8">
          The UK&apos;s digital TA10 platform for sellers, buyers, conveyancers, agents, and surveyors.
        </p>
        <Link
          href="/auth/signin"
          className="block w-full bg-blue-900 text-white py-3 rounded-lg font-semibold text-center hover:bg-blue-800 transition"
        >
          Sign In
        </Link>
      </div>
    </main>
  )
}
