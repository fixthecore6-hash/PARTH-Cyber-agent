import { useState, useEffect } from 'react'
import { fetchProcesses } from '../hooks/useApi'

export function ProcessTable() {
  const [procs, setProcs] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await fetchProcesses()
      setProcs(d.processes || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Top Processes</span>
        <button onClick={load} style={{ background: 'transparent', color: 'var(--text3)', fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4 }}>
          Refresh
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
          <thead>
            <tr style={{ color: 'var(--text3)', fontSize: 11 }}>
              {['PID', 'Name', 'User', 'CPU%', 'MEM%', 'Status'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {procs.map(p => (
              <tr key={p.pid} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '6px 12px', color: 'var(--text3)' }}>{p.pid}</td>
                <td style={{ padding: '6px 12px', color: 'var(--text)' }}>{p.name}</td>
                <td style={{ padding: '6px 12px', color: 'var(--text2)' }}>{p.username || '—'}</td>
                <td style={{ padding: '6px 12px', color: (p.cpu_percent || 0) > 50 ? 'var(--amber)' : 'var(--text2)' }}>
                  {(p.cpu_percent || 0).toFixed(1)}
                </td>
                <td style={{ padding: '6px 12px', color: (p.memory_percent || 0) > 10 ? 'var(--amber)' : 'var(--text2)' }}>
                  {(p.memory_percent || 0).toFixed(1)}
                </td>
                <td style={{ padding: '6px 12px', color: p.status === 'running' ? 'var(--green)' : 'var(--text3)' }}>
                  {p.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: 12 }}>Loading...</div>}
      </div>
    </div>
  )
}
