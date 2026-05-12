export default function Custom500() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: '#f8fafc' }}>
      <div style={{ maxWidth: '28rem', width: '100%', background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>500 — Server Error</h1>
        <p style={{ color: '#4b5563', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Something went wrong on our end. Please try again.</p>
        <a href="/" style={{ color: '#1d4ed8', fontSize: '0.875rem' }}>Return to home</a>
      </div>
    </main>
  )
}
