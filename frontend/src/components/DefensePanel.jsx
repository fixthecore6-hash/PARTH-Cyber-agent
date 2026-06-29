import { useState, useEffect } from 'react'

const BASE = window.__PARTH_BASE__ || '/api'
const post = (path, body) => fetch(`${BASE}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r=>r.json())
const get  = path => fetch(`${BASE}${path}`).then(r=>r.json())

function Card({ title, children }) {
  return (
    <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px'}}>
      <div style={{color:'var(--text2)',fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>{title}</div>
      {children}
    </div>
  )
}

function Btn({ onClick, disabled, color='var(--blue)', children, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? 'var(--bg2)' : `${color}22`,
      color: disabled ? 'var(--text3)' : color,
      border: `1px solid ${disabled ? 'var(--border)' : color+'55'}`,
      borderRadius:4, padding: small ? '3px 10px' : '6px 14px',
      fontSize: small ? 11 : 12, fontFamily:'var(--mono)', cursor: disabled ? 'default' : 'pointer',
    }}>{children}</button>
  )
}

function Inp({ value, onChange, placeholder, style }) {
  return (
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{flex:1,background:'var(--bg)',border:'1px solid var(--border2)',borderRadius:4,padding:'5px 8px',color:'var(--text)',fontFamily:'var(--mono)',fontSize:12,...style}}/>
  )
}

function Result({ r }) {
  if (!r) return null
  return <div style={{marginTop:8,fontSize:12,color:r.ok?'var(--green)':'var(--red)',fontFamily:'var(--mono)'}}>{r.ok?'✓':'✗'} {r.message || r.error}</div>
}

// ── Hardening Score ────────────────────────────────────────
function HardeningCheck() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try { setData(await get('/defense/hardening')) } catch {}
    setLoading(false)
  }

  const color = s => s >= 80 ? 'var(--green)' : s >= 60 ? 'var(--amber)' : 'var(--red)'

  return (
    <Card title="🛡 System Hardening Score">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
        {data && (
          <div style={{fontSize:40,fontWeight:900,color:color(data.score),fontFamily:'var(--mono)'}}>
            {data.score}%
          </div>
        )}
        <div>
          {data && <div style={{color:'var(--text3)',fontSize:12}}>{data.passed}/{data.total} checks passed · {data.platform}</div>}
          <Btn onClick={run} disabled={loading}>{loading ? 'Checking…' : 'Run Hardening Check'}</Btn>
        </div>
      </div>
      {data?.checks?.map((c,i) => (
        <div key={i} style={{display:'flex',gap:8,padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
          <span style={{color:c.passed?'var(--green)':'var(--red)',fontFamily:'var(--mono)',minWidth:16}}>{c.status}</span>
          <div style={{flex:1}}>
            <div style={{color:'var(--text)'}}>{c.name}</div>
            {c.fix && <div style={{color:'var(--amber)',fontSize:11,fontFamily:'var(--mono)',marginTop:2}}>Fix: {c.fix}</div>}
          </div>
        </div>
      ))}
    </Card>
  )
}

// ── IP Blocker ────────────────────────────────────────────
function IPBlocker() {
  const [ip, setIp]         = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [rules, setRules]   = useState(null)

  const block = async () => {
    setLoading(true)
    try { setResult(await post('/defense/block-ip', {ip, direction:'both'})) } catch(e) { setResult({ok:false,message:String(e)}) }
    setLoading(false)
  }
  const unblock = async () => {
    setLoading(true)
    try { setResult(await post('/defense/unblock-ip', {ip})) } catch(e) { setResult({ok:false,message:String(e)}) }
    setLoading(false)
  }
  const loadRules = async () => {
    try { setRules(await get('/defense/firewall-rules')) } catch {}
  }

  return (
    <Card title="🔥 Firewall — Block IP">
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <Inp value={ip} onChange={setIp} placeholder="e.g. 1.2.3.4"/>
        <Btn onClick={block} disabled={loading||!ip} color="var(--red)">{loading?'…':'Block'}</Btn>
        <Btn onClick={unblock} disabled={loading||!ip} color="var(--green)">{loading?'…':'Unblock'}</Btn>
      </div>
      <Result r={result}/>
      <div style={{marginTop:8}}>
        <Btn onClick={loadRules} color="var(--text3)" small>Show Firewall Rules</Btn>
        {rules && <pre style={{background:'var(--bg)',borderRadius:4,padding:'8px',fontSize:10,color:'var(--text2)',marginTop:6,maxHeight:120,overflowY:'auto',whiteSpace:'pre-wrap'}}>{rules.rules||'No rules found'}</pre>}
      </div>
    </Card>
  )
}

// ── Open Ports ────────────────────────────────────────────
function OpenPorts() {
  const [ports, setPorts]   = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setPorts(await get('/defense/open-ports')) } catch {}
    setLoading(false)
  }

  const closePort = async (port, type) => {
    try {
      const r = await post('/defense/close-port', {port, protocol: type.toLowerCase()})
      setResult(r)
    } catch(e) { setResult({ok:false,message:String(e)}) }
  }

  const RISKY = new Set([21,22,23,25,3389,5900,1433,3306,5432,6379,27017])

  return (
    <Card title="🔌 Open Ports">
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <Btn onClick={load} disabled={loading}>{loading?'Scanning…':'Scan Open Ports'}</Btn>
      </div>
      <Result r={result}/>
      {ports?.error && <div style={{color:'var(--amber)',fontSize:12}}>{ports.error}</div>}
      {ports?.ports && (
        <div style={{maxHeight:220,overflowY:'auto',marginTop:6}}>
          {ports.ports.map((p,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
              <span style={{color:RISKY.has(p.port)?'var(--red)':'var(--text)',fontFamily:'var(--mono)',minWidth:50}}>{p.port}</span>
              <span style={{color:'var(--text3)',minWidth:40}}>{p.type}</span>
              <span style={{color:'var(--text2)',flex:1}}>{p.process} (pid:{p.pid})</span>
              {RISKY.has(p.port) && <span style={{color:'var(--red)',fontSize:10}}>⚠ risky</span>}
              <Btn onClick={()=>closePort(p.port, p.type)} color="var(--red)" small>Block</Btn>
            </div>
          ))}
          {ports.ports.length===0 && <div style={{color:'var(--green)',fontSize:12}}>No listening ports found</div>}
        </div>
      )}
    </Card>
  )
}

// ── Process Manager ───────────────────────────────────────
function ProcessManager() {
  const [procs, setProcs]   = useState([])
  const [search, setSearch] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await get('/processes?limit=50')
      setProcs(d.processes || [])
    } catch {}
    setLoading(false)
  }

  const kill = async (pid, force=false) => {
    try {
      const r = await post('/defense/kill-process', {pid, force})
      setResult(r)
      setTimeout(load, 1000)
    } catch(e) { setResult({ok:false,message:String(e)}) }
  }

  const suspend = async (pid) => {
    try { setResult(await post('/defense/suspend', {pid})) } catch(e) { setResult({ok:false,message:String(e)}) }
  }

  useEffect(() => { load() }, [])

  const filtered = procs.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Card title="⚙ Process Manager">
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <Inp value={search} onChange={setSearch} placeholder="Filter by name…"/>
        <Btn onClick={load} disabled={loading} small>{loading?'…':'↻'}</Btn>
      </div>
      <Result r={result}/>
      <div style={{maxHeight:240,overflowY:'auto'}}>
        {filtered.map((p,i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 2px',borderBottom:'1px solid var(--border)',fontSize:11}}>
            <span style={{color:'var(--text3)',minWidth:50,fontFamily:'var(--mono)'}}>{p.pid}</span>
            <span style={{color:'var(--text)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span>
            <span style={{color:p.cpu_percent>20?'var(--red)':p.cpu_percent>5?'var(--amber)':'var(--text3)',minWidth:46,fontFamily:'var(--mono)',textAlign:'right'}}>{(p.cpu_percent||0).toFixed(1)}%</span>
            <span style={{color:'var(--text3)',minWidth:46,fontFamily:'var(--mono)',textAlign:'right'}}>{(p.memory_percent||0).toFixed(1)}%</span>
            <Btn onClick={()=>suspend(p.pid)} color="var(--amber)" small>⏸</Btn>
            <Btn onClick={()=>kill(p.pid)} color="var(--red)" small>✕</Btn>
          </div>
        ))}
      </div>
      <div style={{color:'var(--text3)',fontSize:10,marginTop:4,fontFamily:'var(--mono)'}}>CPU% · MEM% shown per process</div>
    </Card>
  )
}

// ── Kill Switch ───────────────────────────────────────────
function KillSwitch() {
  const [active, setActive] = useState(false)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      const r = await post('/defense/killswitch', {enable: !active})
      setResult(r)
      if (r.ok) setActive(a => !a)
    } catch(e) { setResult({ok:false,message:String(e)}) }
    setLoading(false)
  }

  return (
    <Card title="🚨 Network Kill-Switch">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
        <button onClick={toggle} disabled={loading} style={{
          width:56,height:28,borderRadius:14,border:'none',cursor:'pointer',
          background: active ? 'var(--red)' : 'var(--border2)',
          position:'relative',transition:'background .2s',
        }}>
          <span style={{position:'absolute',top:3,left: active ? 30 : 4,width:22,height:22,borderRadius:'50%',background:'#fff',transition:'left .2s',display:'block'}}/>
        </button>
        <div>
          <div style={{color: active ? 'var(--red)' : 'var(--text3)', fontSize:13, fontWeight:600}}>
            {active ? '🚨 ACTIVE — outbound blocked' : 'Inactive'}
          </div>
          <div style={{color:'var(--text3)',fontSize:11}}>Blocks all outbound traffic (emergency use)</div>
        </div>
      </div>
      <Result r={result}/>
    </Card>
  )
}

// ── Startup Manager ───────────────────────────────────────
function StartupManager() {
  const [items, setItems]   = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setItems(await get('/defense/startup')) } catch {}
    setLoading(false)
  }

  const disable = async (name, location) => {
    try { setResult(await post('/defense/startup/disable', {name, location})); load() }
    catch(e) { setResult({ok:false,message:String(e)}) }
  }

  return (
    <Card title="🚀 Startup Programs">
      <Btn onClick={load} disabled={loading} style={{marginBottom:8}}>{loading?'Loading…':'List Startup Programs'}</Btn>
      <Result r={result}/>
      {items && (
        <div style={{maxHeight:200,overflowY:'auto',marginTop:6}}>
          {items.items?.length===0 && <div style={{color:'var(--text3)',fontSize:12}}>No startup programs found</div>}
          {items.items?.map((s,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
              <div style={{flex:1}}>
                <div style={{color:'var(--text)'}}>{s.name}</div>
                {s.command && <div style={{color:'var(--text3)',fontSize:10,fontFamily:'var(--mono)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:300}}>{s.command}</div>}
              </div>
              <span style={{color:'var(--text3)',fontSize:10}}>{s.location}</span>
              <Btn onClick={()=>disable(s.name, s.location)} color="var(--red)" small>Disable</Btn>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Main Defense Panel ─────────────────────────────────────
const SECTIONS = [
  {id:'hardening', label:'🛡 Hardening',  comp: HardeningCheck},
  {id:'ports',     label:'🔌 Ports',      comp: OpenPorts},
  {id:'firewall',  label:'🔥 Firewall',   comp: IPBlocker},
  {id:'procs',     label:'⚙ Processes',  comp: ProcessManager},
  {id:'startup',   label:'🚀 Startup',    comp: StartupManager},
  {id:'killswitch',label:'🚨 Kill-Switch',comp: KillSwitch},
]

export function DefensePanel() {
  const [active, setActive] = useState('hardening')
  const ActiveComp = SECTIONS.find(s=>s.id===active)?.comp || HardeningCheck

  return (
    <div style={{display:'flex',gap:14,height:'calc(100vh - 90px)'}}>
      {/* Sidebar */}
      <div style={{width:160,display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
        <div style={{color:'var(--text3)',fontSize:10,letterSpacing:'.1em',textTransform:'uppercase',padding:'0 4px',marginBottom:4}}>Defense</div>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={()=>setActive(s.id)} style={{
            background: active===s.id ? 'var(--bg3)' : 'transparent',
            color: active===s.id ? 'var(--text)' : 'var(--text3)',
            border: active===s.id ? '1px solid var(--border2)' : '1px solid transparent',
            borderRadius:6, padding:'7px 10px', textAlign:'left', cursor:'pointer', fontSize:12,
          }}>{s.label}</button>
        ))}
      </div>
      {/* Content */}
      <div style={{flex:1,overflowY:'auto'}}>
        <ActiveComp/>
      </div>
    </div>
  )
}
