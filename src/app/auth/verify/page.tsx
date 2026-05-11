export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-gray-600 text-sm">
          A sign-in link has been sent. Click the link in your email to continue.
          The link expires in 72 hours and can only be used once.
        </p>
      </div>
    </main>
  )
}
