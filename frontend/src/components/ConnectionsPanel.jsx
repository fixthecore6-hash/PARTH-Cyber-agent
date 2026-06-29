import { useState, useEffect } from 'react'
import { fetchConnections } from '../hooks/useApi'

const BASE = window.__PARTH_BASE__ || '/api'

export function ConnectionsPanel() {
  const [conns, setConns] = useState([])
  const [loading, setLoading] = useState(false)
  const [geoCache, setGeoCache] = useState({})
  const [geoLoading, setGeoLoading] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const d = await fetchConnections()
      setConns(d.connections || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const lookupGeo = async (ip) => {
    if (geoCache[ip] || geoLoading[ip]) return
    setGeoLoading(g => ({ ...g, [ip]: true }))
    try {
      const r = await fetch(`${BASE}/geoip/${ip}`)
      const d = await r.json()
      setGeoCache(c => ({ ...c, [ip]: d }))
    } catch {
      setGeoCache(c => ({ ...c, [ip]: { status: 'fail' } }))
    }
    setGeoLoading(g => ({ ...g, [ip]: false }))
  }

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: 'var(--text2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Active Connections
        </span>
        <button onClick={load} style={{
          background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '3px 10px', fontSize: 11,
        }}>{loading ? '...' : '↻ Refresh'}</button>
      </div>

      {conns.length === 0 && !loading && (
        <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)' }}>No established connections</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
        {conns.map((c, i) => {
          const geo = geoCache[c.remote_ip]
          return (
            <div key={i} style={{
              background: 'var(--bg2)', borderRadius: 4, padding: '6px 10px',
              fontSize: 11, fontFamily: 'var(--mono)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: 'var(--text3)' }}>{c.local}</span>
                  <span style={{ color: 'var(--text3)', margin: '0 6px' }}>→</span>
                  <span style={{ color: 'var(--blue)' }}>{c.remote}</span>
                  <span style={{ color: 'var(--text3)', marginLeft: 8 }}>({c.process || 'unknown'})</span>
                </div>
                <button
                  onClick={() => lookupGeo(c.remote_ip)}
                  style={{
                    background: geo ? 'var(--bg3)' : 'var(--blue-dim)',
                    color: geo ? 'var(--text3)' : 'var(--blue)',
                    border: '1px solid var(--border)', borderRadius: 3,
                    padding: '1px 6px', fontSize: 10, cursor: 'pointer',
                  }}
                >
                  {geoLoading[c.remote_ip] ? '...' : geo ? '🌍' : 'GeoIP'}
                </button>
              </div>
              {geo && geo.status === 'success' && (
                <div style={{ marginTop: 4, color: 'var(--text2)', fontSize: 10 }}>
                  🌍 {geo.city}, {geo.country} — {geo.isp || geo.org}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
