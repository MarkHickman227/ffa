'use client'

export function PrintButtons() {
  return (
    <div
      style={{
        position: 'fixed', top: 16, right: 16, zIndex: 100,
        display: 'flex', gap: 8,
      }}
      className="no-print"
    >
      <button
        onClick={() => window.print()}
        style={{ background: '#1e3a5f', color: '#fff', border: 'none', cursor: 'pointer', padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}
      >
        Print / Save as PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{ background: '#fff', color: '#1e3a5f', border: '2px solid #1e3a5f', cursor: 'pointer', padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}
      >
        Close
      </button>
    </div>
  )
}
