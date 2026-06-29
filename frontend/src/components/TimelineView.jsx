import { SeverityBadge } from './SeverityBadge'

const SKIP_TYPES = ['system_metrics', 'listening_ports_snapshot', 'ping']
const SEV_COLOR = {
  critical: 'var(--red)', high: '#fb923c',
  medium: 'var(--amber)', low: 'var(--green)', info: 'var(--blue)',
}

export function TimelineView({ events }) {
  const filtered = events
    .filter(e => !SKIP_TYPES.includes(e.event_type))
    .slice(0, 100)

  if (filtered.length === 0) {
    return <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 40, fontFamily: 'var(--mono)' }}>No events yet</div>
  }

  // Group by minute
  const groups = {}
  filtered.forEach(e => {
    const key = e.timestamp ? e.timestamp.slice(0, 16).replace('T', ' ') : 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  })

  return (
    <div style={{ padding: '0 4px', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      {Object.entries(groups).map(([minute, evs]) => (
        <div key={minute} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {/* Time axis */}
          <div style={{ minWidth: 100, textAlign: 'right' }}>
            <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, paddingTop: 2 }}>{minute}</div>
          </div>
          {/* Line */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: SEV_COLOR[evs[0]?.severity] || 'var(--border2)', flexShrink: 0, marginTop: 3 }} />
            <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 20 }} />
          </div>
          {/* Events */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {evs.map((e, i) => (
              <div key={i} style={{
                background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 10px', fontSize: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <SeverityBadge severity={e.severity} />
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 11 }}>{e.event_type}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 10 }}>[{e.source}]</span>
                </div>
                <div style={{ color: 'var(--text)', fontSize: 11 }}>
                  {summarize(e)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function summarize(e) {
  const d = e.data || {}
  if (d.raw_line) return d.raw_line.slice(0, 120)
  if (d.reason) return d.reason.slice(0, 120)
  if (d.cmdline) return `cmd: ${d.cmdline.slice(0, 100)}`
  return JSON.stringify(d).slice(0, 100)
}
