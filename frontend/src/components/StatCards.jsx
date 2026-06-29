export function StatCards({ stats }) {
  if (!stats) return null

  const counts = stats.event_counts || {}
  const critical = counts.critical || 0
  const high = counts.high || 0
  const total = stats.total_events_24h || 0
  const hasGpu = stats.gpu_percent !== null && stats.gpu_percent !== undefined

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hasGpu ? 5 : 4}, 1fr)`, gap: 12 }}>
      <Gauge label="CPU" value={stats.cpu_percent} unit="%" warn={75} danger={90} color="var(--blue)" />
      <Gauge label="Memory" value={stats.mem_percent} unit="%" warn={80} danger={92} color="var(--purple)" />
      <Gauge label="Disk" value={stats.disk_percent} unit="%" warn={85} danger={95} color="var(--amber)" />
      {hasGpu && <Gauge label="GPU" value={stats.gpu_percent} unit="%" warn={80} danger={90} color="var(--green)" />}
      <Card label="Threats 24h" value={`${critical}C / ${high}H`} sub={`${total} total events`}
        color={critical > 0 ? 'var(--red)' : high > 0 ? '#fb923c' : 'var(--green)'} />
    </div>
  )
}

function Gauge({ label, value, unit, warn, danger, color }) {
  const v = Math.round(value || 0)
  const c = v >= danger ? 'var(--red)' : v >= warn ? 'var(--amber)' : color
  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{ color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ color: c, fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{v}{unit}</div>
      <div style={{ marginTop: 10, background: 'var(--border)', borderRadius: 3, height: 3 }}>
        <div style={{ width: `${v}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

function Card({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{ color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ color: color, fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8 }}>{sub}</div>
    </div>
  )
}
