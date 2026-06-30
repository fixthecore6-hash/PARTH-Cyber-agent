// created_by:pushkar | helped_by:claude | parth-host-defender
export function StatCards({ stats }) {
  if (!stats) return null

  const counts = stats.event_counts || {}
  const critical = counts.critical || 0
  const high = counts.high || 0
  const total = stats.total_events_24h || 0
  const hasGpu = stats.gpu_percent !== null && stats.gpu_percent !== undefined

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hasGpu ? 5 : 4}, 1fr)`, gap: 10 }}>
      <Gauge label="CPU"    value={stats.cpu_percent}  unit="%" warn={75} danger={90} color="var(--blue)"   icon="⬡"/>
      <Gauge label="Memory" value={stats.mem_percent}  unit="%" warn={80} danger={92} color="var(--purple)" icon="⬡"/>
      <Gauge label="Disk"   value={stats.disk_percent} unit="%" warn={85} danger={95} color="var(--amber)"  icon="⬡"/>
      {hasGpu && <Gauge label="GPU" value={stats.gpu_percent} unit="%" warn={80} danger={90} color="var(--cyan)" icon="⬡"/>}
      <ThreatCard critical={critical} high={high} total={total}/>
    </div>
  )
}

function Gauge({ label, value, unit, warn, danger, color, icon }) {
  const v = Math.round(value || 0)
  const c = v >= danger ? 'var(--red)' : v >= warn ? 'var(--amber)' : color
  const pct = Math.min(v, 100)

  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* top accent line */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, ${c}, transparent)`, opacity:.7 }}/>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ color:'var(--text3)', fontSize:10, textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)' }}>{label}</span>
        <span style={{ color:c, fontSize:9, fontFamily:'var(--mono)', opacity:.7 }}>{v >= danger ? '▲ HIGH' : v >= warn ? '▲ WARN' : '● OK'}</span>
      </div>

      <div style={{ color:c, fontFamily:'var(--mono)', fontSize:26, fontWeight:700, lineHeight:1, letterSpacing:'-.02em' }}>
        {v}<span style={{ fontSize:14, opacity:.7 }}>{unit}</span>
      </div>

      {/* Progress bar track */}
      <div style={{ marginTop:12, background:'var(--border)', borderRadius:2, height:2 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:`linear-gradient(90deg, ${c}88, ${c})`, borderRadius:2, transition:'width .5s ease' }}/>
      </div>
    </div>
  )
}

function ThreatCard({ critical, high, total }) {
  const hasBad = critical > 0 || high > 0
  const c = critical > 0 ? 'var(--red)' : high > 0 ? 'var(--amber)' : 'var(--green)'

  return (
    <div style={{
      background: 'var(--bg3)',
      border: `1px solid ${hasBad ? 'rgba(200,80,60,.3)' : 'var(--border)'}`,
      borderRadius: 6,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, ${c}, transparent)`, opacity:.7 }}/>
      <div style={{ color:'var(--text3)', fontSize:10, textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:10 }}>Threats 24h</div>
      <div style={{ display:'flex', gap:12, alignItems:'baseline' }}>
        {critical > 0 && <span style={{ color:'var(--red)', fontFamily:'var(--mono)', fontSize:22, fontWeight:700 }}>{critical}<span style={{ fontSize:10, opacity:.8 }}> C</span></span>}
        {high > 0     && <span style={{ color:'var(--amber)', fontFamily:'var(--mono)', fontSize:22, fontWeight:700 }}>{high}<span style={{ fontSize:10, opacity:.8 }}> H</span></span>}
        {!hasBad      && <span style={{ color:'var(--green)', fontFamily:'var(--mono)', fontSize:22, fontWeight:700 }}>Clear</span>}
      </div>
      <div style={{ color:'var(--text3)', fontSize:10, marginTop:10, fontFamily:'var(--mono)' }}>{total} total events</div>
    </div>
  )
}
