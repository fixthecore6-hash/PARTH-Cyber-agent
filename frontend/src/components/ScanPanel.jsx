import { useState } from 'react'
import { runNmapScan } from '../hooks/useApi'

export function ScanPanel() {
  const [target, setTarget] = useState('127.0.0.1')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const run = async () => {
    if (!confirmed) { alert('Check the confirmation box first.'); return }
    setLoading(true)
    setResult(null)
    try {
      const d = await runNmapScan(target)
      setResult(d)
    } catch (e) {
      setResult({ error: String(e) })
    }
    setLoading(false)
  }

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ color: 'var(--text2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
        Network Scan (Nmap)
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder="Target IP or hostname"
          style={{
            flex: 1, background: 'var(--bg2)', border: '1px solid var(--border2)',
            borderRadius: 4, padding: '7px 10px', color: 'var(--text)',
            fontFamily: 'var(--mono)', fontSize: 13,
          }}
        />
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: loading ? 'var(--bg2)' : 'var(--blue-dim)',
            color: loading ? 'var(--text3)' : 'var(--blue)',
            border: '1px solid var(--border2)',
            borderRadius: 4, padding: '7px 16px', fontSize: 12,
            fontFamily: 'var(--mono)',
          }}
        >
          {loading ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)', cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        I confirm this target is on my own network and I have permission to scan it
      </label>

      {result && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 4, padding: 12, maxHeight: 300, overflowY: 'auto',
        }}>
          {result.error ? (
            <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 12 }}>{result.error}</span>
          ) : (
            <pre style={{ color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'pre-wrap' }}>
              {result.output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
