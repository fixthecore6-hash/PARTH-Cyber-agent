import { useState, useEffect, useRef, useCallback } from 'react'
import { useEventStream } from './hooks/useEventStream'
import { useStats } from './hooks/useApi'
import { StatCards } from './components/StatCards'
import { EventFeed } from './components/EventFeed'
import { ThreatSummary } from './components/ThreatSummary'
import { ProcessTable } from './components/ProcessTable'
import { ConnectionsPanel } from './components/ConnectionsPanel'
import { ScanPanel } from './components/ScanPanel'
import { TimelineView } from './components/TimelineView'
import { AlertsConfig } from './components/AlertsConfig'
import { ModelSettings } from './components/ModelSettings'
import { DevTools } from './components/DevTools'
import { FileEditor } from './components/FileEditor'
import { AIAssistant } from './components/AIAssistant'
import { ScreenCapture } from './components/ScreenCapture'

/*
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PARTH Host Defender — Intellectual Property Notice             ║
 * ║  Original Author  : Pushkar                                     ║
 * ║  UI Refinements   : Assisted by Claude (Anthropic) — claude.ai  ║
 * ║  License          : Open Source — attribution required          ║
 * ║                                                                  ║
 * ║  This file contains a verifiable authorship fingerprint.        ║
 * ║  Any redistribution must retain this notice intact.             ║
 * ║  Removal of these credits is a violation of the project terms.  ║
 * ║                                                                  ║
 * ║  PARTH_AUTHOR_FINGERPRINT: pushkar|parth-defender|2024          ║
 * ║  ASSISTED_BY: claude-anthropic|claude.ai                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ── Dynamic server config ─────────────────────────────────────────────────────
// BASE and WS_BASE are set at runtime after user picks a server
let BASE    = '/api'
let WS_BASE = null  // null = use relative (same host), else ws://IP:PORT

const SERVERS_KEY = 'parth_servers_v2'
const ACTIVE_KEY  = 'parth_active_server'

function loadServers() {
  try { return JSON.parse(localStorage.getItem(SERVERS_KEY) || '[]') } catch { return [] }
}
function saveServers(list) { localStorage.setItem(SERVERS_KEY, JSON.stringify(list)) }
function loadActive() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null') } catch { return null }
}
function saveActive(s) { localStorage.setItem(ACTIVE_KEY, JSON.stringify(s)) }

function applyServer(server) {
  // When accessed via Vite dev server (localhost OR LAN IP), the proxy
  // always forwards /api and /ws to the local backend. Use relative URLs.
  // Only use absolute URLs when connecting to a DIFFERENT machine entirely.
  const isViaDev = !server.ip ||
    server.local ||
    server.ip === '127.0.0.1' ||
    server.ip === 'localhost' ||
    server.ip === window.location.hostname

  if (isViaDev) {
    BASE = '/api'
    window.__PARTH_WS_BASE__ = null
  } else {
    const bp = server.backendPort || server.port
    BASE = `http://${server.ip}:${bp}/api`
    window.__PARTH_WS_BASE__ = `ws://${server.ip}:${bp}`
  }
  window.__PARTH_BASE__ = BASE
}

// ── Server Picker Screen ──────────────────────────────────────────────────────
function ServerPicker({ onConnect }) {
  const [servers, setServers]   = useState(loadServers)
  const [adding, setAdding]     = useState(false)
  const [editing, setEditing]   = useState(null)
  const [name, setName]         = useState('')
  const [ip, setIp]             = useState('')
  const [port, setPort]         = useState('5173')
  const [pings, setPings]       = useState({})
  const [err, setErr]           = useState('')

  // On first load, add localhost as default if empty
  useEffect(() => {
    if (servers.length === 0) {
      const def = [{ id: 'local', name: 'This PC (localhost)', ip: 'localhost', port: 5173, local: true }]
      setServers(def); saveServers(def)
    }
  }, [])

  const ping = async (s) => {
    setPings(p => ({ ...p, [s.id]: 'checking' }))
    try {
      const url = s.local ? '/api/stats' : `http://${s.ip}:${s.port}/api/stats`
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 3000)
      await fetch(url, { signal: ctrl.signal, mode: s.local ? 'same-origin' : 'no-cors' })
      setPings(p => ({ ...p, [s.id]: 'online' }))
    } catch {
      setPings(p => ({ ...p, [s.id]: 'offline' }))
    }
  }

  const openAdd = () => { setName(''); setIp(''); setPort('5173'); setErr(''); setAdding(true); setEditing(null) }
  const openEdit = (s) => { setName(s.name); setIp(s.ip); setPort(String(s.port)); setErr(''); setEditing(s); setAdding(true) }

  const save = () => {
    if (!name.trim()) { setErr('Name required'); return }
    if (!ip.trim()) { setErr('IP required'); return }
    if (isNaN(parseInt(port))) { setErr('Valid port required'); return }
    const s = { id: editing?.id || Date.now().toString(), name: name.trim(), ip: ip.trim(), port: parseInt(port), local: false }
    const list = editing ? servers.map(x => x.id === editing.id ? s : x) : [...servers, s]
    setServers(list); saveServers(list); setAdding(false); setEditing(null)
  }

  const del = (id) => {
    if (id === 'local') return
    const list = servers.filter(s => s.id !== id)
    setServers(list); saveServers(list)
  }

  const connect = (s) => {
    saveActive(s); applyServer(s); onConnect(s)
  }

  const G = '#00e5a0', BG = '#060810', BG2 = '#0b0e18', BG3 = '#101422', BG4 = '#161b2e'
  const BD = '#1c2238', BD2 = '#252d45', T = '#e8edf5', T2 = '#7d8ba3', T3 = '#3d4a63'
  const RED = '#ff3860', AMBER = '#ffb830'

  const iStyle = { width:'100%', background:BG, border:`1px solid ${BD2}`, borderRadius:8, padding:'11px 12px', color:T, fontFamily:"'JetBrains Mono',monospace", fontSize:13 }

  return (
    <div style={{ minHeight:'100vh', background:BG, fontFamily:"'Inter',sans-serif", position:'relative', zIndex:1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body::before{content:'';position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(0,229,160,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,160,.018) 1px,transparent 1px);background-size:44px 44px;z-index:0;}
        @keyframes glow{0%,100%{box-shadow:0 0 12px rgba(0,229,160,.3)}50%{box-shadow:0 0 28px rgba(0,229,160,.7)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Header */}
      <div style={{ padding:'24px 20px 16px', borderBottom:`1px solid ${BD}`, background:BG2, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:`radial-gradient(circle at 35% 35%,${G},#003d2a)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, color:'#000', animation:'glow 4s infinite' }}>P</div>
          <div>
            <div style={{ color:T, fontWeight:800, letterSpacing:'.1em', fontSize:18 }}>PARTH</div>
            <div style={{ color:T3, fontSize:10, letterSpacing:'.2em' }}>SELECT SERVER</div>
          </div>
        </div>
        <button onClick={openAdd} style={{ background:`rgba(0,229,160,.12)`, color:G, border:`1px solid rgba(0,229,160,.3)`, borderRadius:8, padding:'8px 16px', fontWeight:600, fontSize:13, cursor:'pointer' }}>+ Add Server</button>
      </div>

      <div style={{ padding:'20px', maxWidth:520, margin:'0 auto' }}>

        {/* Add/Edit form */}
        {adding && (
          <div style={{ background:BG3, border:`1px solid ${BD2}`, borderRadius:12, padding:'18px', marginBottom:16, animation:'fadeUp .3s ease' }}>
            <div style={{ color:T, fontWeight:700, fontSize:15, marginBottom:14 }}>{editing ? 'Edit Server' : 'Add New Server'}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={{ color:T3, fontSize:10, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:5 }}>Display Name</div>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Home PC / Work Server" style={iStyle}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
                <div>
                  <div style={{ color:T3, fontSize:10, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:5 }}>IP Address</div>
                  <input value={ip} onChange={e=>setIp(e.target.value)} placeholder="192.168.1.100" style={iStyle} autoCapitalize="none" autoCorrect="off"/>
                </div>
                <div>
                  <div style={{ color:T3, fontSize:10, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:5 }}>Port</div>
                  <input value={port} onChange={e=>setPort(e.target.value)} placeholder="5173" style={{ ...iStyle, width:90 }} inputMode="numeric"/>
                </div>
              </div>
              {err && <div style={{ color:RED, fontSize:12 }}>⚠ {err}</div>}
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={save} style={{ flex:1, background:G, color:'#000', borderRadius:8, padding:'11px', fontWeight:700, fontSize:14, cursor:'pointer' }}>Save</button>
                <button onClick={() => { setAdding(false); setEditing(null) }} style={{ background:BG4, color:T2, border:`1px solid ${BD}`, borderRadius:8, padding:'11px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Server list */}
        <div style={{ color:T3, fontSize:10, textTransform:'uppercase', letterSpacing:'.12em', marginBottom:10 }}>{servers.length} server{servers.length!==1?'s':''}</div>
        {servers.map((s, i) => {
          const status = pings[s.id]
          const statusColor = status==='online' ? G : status==='offline' ? RED : BD2
          return (
            <div key={s.id} style={{ background:BG3, border:`1px solid ${BD}`, borderRadius:12, padding:'14px 16px', marginBottom:10, animation:`fadeUp .3s ${i*60}ms ease both`, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:`linear-gradient(90deg,transparent,${G}22,transparent)` }}/>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ width:38, height:38, borderRadius:9, background:`radial-gradient(circle at 35% 35%,${G},#003d2a)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:'#000', flexShrink:0 }}>P</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:T, fontWeight:700, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                  <div style={{ color:T3, fontFamily:"'JetBrains Mono',monospace", fontSize:11, marginTop:2 }}>
                    {s.local ? 'localhost' : s.ip}:{s.port}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <div style={{ width:9, height:9, borderRadius:'50%', background:statusColor, transition:'background .3s', boxShadow:status==='online'?`0 0 8px ${G}`:status==='offline'?`0 0 8px ${RED}`:'none' }}/>
                  <button onClick={() => ping(s)} style={{ background:'transparent', color:T3, border:'none', fontSize:10, cursor:'pointer' }}>
                    {status==='checking' ? '…' : 'ping'}
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => connect(s)}
                  style={{ flex:1, background:G, color:'#000', borderRadius:8, padding:'10px', fontWeight:700, fontSize:14, cursor:'pointer', boxShadow:`0 4px 14px rgba(0,229,160,.25)` }}>
                  Connect →
                </button>
                {!s.local && <>
                  <button onClick={() => openEdit(s)} style={{ background:BG4, color:T2, border:`1px solid ${BD}`, borderRadius:8, padding:'10px 12px', fontSize:13, cursor:'pointer' }}>✏</button>
                  <button onClick={() => del(s.id)} style={{ background:'rgba(255,56,96,.1)', color:RED, border:'1px solid rgba(255,56,96,.2)', borderRadius:8, padding:'10px 12px', fontSize:13, cursor:'pointer' }}>✕</button>
                </>}
              </div>
            </div>
          )
        })}

        <div style={{ marginTop:20, background:BG3, border:`1px solid ${BD}`, borderRadius:10, padding:'14px 16px' }}>
          <div style={{ color:T2, fontSize:12, fontWeight:600, marginBottom:8 }}>💡 How to find your IP</div>
          {[
            'Start PARTH on your PC: bash scripts/start.sh',
            'It prints "Phone: http://192.168.x.x:5173"',
            'Enter that IP and port 5173 above',
            'Both devices must be on the same WiFi',
          ].map((t,i) => (
            <div key={i} style={{ display:'flex', gap:8, marginBottom:6 }}>
              <span style={{ color:G, fontFamily:"'JetBrains Mono',monospace", fontSize:11, flexShrink:0 }}>{i+1}.</span>
              <span style={{ color:T3, fontSize:12, lineHeight:1.5 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}



const SR = window.SpeechRecognition || window.webkitSpeechRecognition
const PARTH_NAME = 'PARTH'
const PARTH_CREATOR = 'Pushkar'

// ── TTS — must be triggered inside a user gesture ────────────────────────────
// We keep a queue and a "tts ready" flag
let _ttsUnlocked = false
function unlockTTS() { _ttsUnlocked = true }

// ── useIsMobile ───────────────────────────────────────────────────────────────
function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

// ── Splash ────────────────────────────────────────────────────────────────────
function SplashScreen({ onEnter }) {
  return (
    <div onClick={unlockTTS} style={{ width:'100vw', height:'100vh', background:'#110a08', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', fontFamily:"'Sora',sans-serif", overflow:'hidden', position:'relative' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&display=swap');
        .sp-letter { display:inline-block; background:linear-gradient(180deg,#f5c86a,#e8a93c,#c8702a); -webkit-background-clip:text; -webkit-text-fill-color:transparent; clip-path:inset(100% 0 0 0); animation:sp-up .55s cubic-bezier(.17,.67,.5,1.1) forwards; padding:0 3px; }
        .sp-letter:nth-child(1){animation-delay:.08s} .sp-letter:nth-child(2){animation-delay:.18s} .sp-letter:nth-child(3){animation-delay:.28s} .sp-letter:nth-child(4){animation-delay:.38s} .sp-letter:nth-child(5){animation-delay:.48s}
        @keyframes sp-up{from{clip-path:inset(100% 0 0 0);transform:translateY(24px)}to{clip-path:inset(0% 0 0 0);transform:translateY(0)}}
        .sp-line { position:absolute; left:-100%; width:55%; height:1px; background:linear-gradient(90deg,transparent,#e8a93c,#fff8,#e8a93c,transparent); animation:sp-shoot 1.1s ease-out .6s forwards; opacity:0; }
        @keyframes sp-shoot{0%{left:-55%;opacity:1}100%{left:110%;opacity:0}}
        .sp-btn { margin-top:60px; padding:13px 48px; background:transparent; border:1px solid rgba(232,169,60,.6); font-size:.8rem; font-weight:700; color:#e8a93c; letter-spacing:.22em; text-transform:uppercase; cursor:pointer; opacity:0; animation:sp-fadein .5s ease 2s forwards; transition:background .2s,color .2s; font-family:'Sora',sans-serif; }
        .sp-btn:hover{background:rgba(232,169,60,.12);color:#f5c86a;}
        @keyframes sp-fadein{to{opacity:1}}
        .sp-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(200,130,60,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(200,130,60,.04) 1px,transparent 1px),linear-gradient(45deg,rgba(200,130,60,.018) 1px,transparent 1px),linear-gradient(-45deg,rgba(200,130,60,.018) 1px,transparent 1px);background-size:44px 44px,44px 44px,44px 44px,44px 44px;pointer-events:none}
        .sp-sub{color:rgba(200,130,60,.45);font-size:.62rem;letter-spacing:.28em;margin-top:10px;opacity:0;animation:sp-fadein .5s ease 1.3s forwards;font-family:'Sora',sans-serif;font-weight:400;text-transform:uppercase}
        .sp-deva{color:rgba(200,130,60,.3);font-size:.7rem;letter-spacing:.15em;margin-top:6px;opacity:0;animation:sp-fadein .5s ease 1.6s forwards;font-family:'Tiro Devanagari Sanskrit',serif}
      `}</style>
      <div className="sp-grid"/>
      <div className="sp-line"/>
      <div style={{ position:'relative', zIndex:2, textAlign:'center' }}>
        <div style={{ fontSize:'clamp(4rem,13vw,8.5rem)', display:'flex', justifyContent:'center', filter:'drop-shadow(0 0 40px rgba(232,169,60,.25))' }}>
          {'PARTH'.split('').map((l,i) => <span key={i} className="sp-letter">{l}</span>)}
        </div>
        <div className="sp-sub">Proactive Autonomous Real-Time Host-Defender</div>
        <div className="sp-deva">रक्षा · विवेक · सतर्कता</div>
      </div>
      <button className="sp-btn" onClick={e => { unlockTTS(); onEnter(); }}>Enter Dashboard</button>
    </div>
  )
}

// ── Defense Panel ─────────────────────────────────────────────────────────────
function DefensePanel() {
  const [actions, setActions] = useState([])
  const [log, setLog]         = useState([])
  const [ipInput, setIpInput] = useState('')
  const [portInput, setPortInput] = useState('')
  const [loading, setLoading] = useState('')

  const run = async (action, params = {}) => {
    setLoading(action)
    try {
      const r = await fetch(`${BASE}/actions/approve`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ event_id: 'manual', action, confirmed: true, params })
      })
      const d = await r.json()
      setLog(l => [`[${new Date().toLocaleTimeString()}] ${action}: ${d.result || d.status}`, ...l].slice(0,20))
    } catch(e) { setLog(l => [`[ERR] ${e.message}`, ...l]) }
    setLoading('')
  }

  const TOOLS = [
    { id:'ufw_enable', label:'Enable Firewall', icon:'🛡', color:'var(--green)', desc:'Enable UFW firewall', params:{} },
    { id:'disable_root_ssh', label:'Disable Root SSH', icon:'🔐', color:'var(--amber)', desc:'Block root SSH login', params:{} },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => run(t.id, t.params)} disabled={!!loading}
            style={{ background:'var(--bg4)', border:`1px solid ${t.color}33`, borderRadius:8, padding:'14px', textAlign:'left', cursor:'pointer', opacity:loading===t.id?.5:1 }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{t.icon}</div>
            <div style={{ color:'var(--text)', fontSize:13, fontWeight:600 }}>{t.label}</div>
            <div style={{ color:'var(--text3)', fontSize:11, marginTop:3 }}>{t.desc}</div>
            {loading===t.id && <div style={{ color:t.color, fontSize:10, marginTop:4 }}>Running…</div>}
          </button>
        ))}
      </div>

      {/* Block IP */}
      <div style={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:8, padding:'12px' }}>
        <div style={{ color:'var(--text2)', fontSize:12, marginBottom:8, textTransform:'uppercase', letterSpacing:'.08em' }}>Block IP Address</div>
        <div style={{ display:'flex', gap:8 }}>
          <input value={ipInput} onChange={e=>setIpInput(e.target.value)} placeholder="192.168.1.100"
            style={{ flex:1, background:'var(--bg)', border:'1px solid var(--border2)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontFamily:'var(--mono)', fontSize:12 }}/>
          <button onClick={()=>{ if(ipInput) run('ufw_deny',{ip:ipInput}) }}
            style={{ background:'rgba(255,56,96,.15)', color:'var(--red)', border:'1px solid rgba(255,56,96,.3)', borderRadius:6, padding:'7px 16px', fontSize:12 }}>Block</button>
        </div>
      </div>

      {/* Kill process */}
      <div style={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:8, padding:'12px' }}>
        <div style={{ color:'var(--text2)', fontSize:12, marginBottom:8, textTransform:'uppercase', letterSpacing:'.08em' }}>Kill Process by PID</div>
        <div style={{ display:'flex', gap:8 }}>
          <input value={portInput} onChange={e=>setPortInput(e.target.value)} placeholder="PID e.g. 1234"
            style={{ flex:1, background:'var(--bg)', border:'1px solid var(--border2)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontFamily:'var(--mono)', fontSize:12 }}/>
          <button onClick={()=>{ if(portInput) run('kill_process',{pid:portInput}) }}
            style={{ background:'rgba(255,56,96,.15)', color:'var(--red)', border:'1px solid rgba(255,56,96,.3)', borderRadius:6, padding:'7px 16px', fontSize:12 }}>Kill</button>
        </div>
      </div>

      {/* Action log */}
      {log.length > 0 && (
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'10px 12px', maxHeight:140, overflowY:'auto' }}>
          <div style={{ color:'var(--text3)', fontSize:10, marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Action Log</div>
          {log.map((l,i) => <div key={i} style={{ color:'var(--green)', fontFamily:'var(--mono)', fontSize:11, padding:'2px 0' }}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

// ── Natural TTS with human-like voice ────────────────────────────────────────
// Add natural pauses, breathing rhythm to make speech feel human
function speak(text) {
  if (!('speechSynthesis' in window) || !_ttsUnlocked) return
  window.speechSynthesis.cancel()

  // Split into sentences for natural pacing
  const sentences = text
    .replace(/[#*`_>[\]]/g, '')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim())

  let delay = 0
  sentences.forEach((sentence, i) => {
    setTimeout(() => {
      const utt = new SpeechSynthesisUtterance(sentence.trim())
      // Vary rate/pitch slightly per sentence for natural feel
      utt.rate  = 0.88 + (Math.random() * 0.08)   // 0.88–0.96 (slower = more natural)
      utt.pitch = 1.0  + (Math.random() * 0.1) - 0.05
      utt.volume = 1.0

      const voices = window.speechSynthesis.getVoices()
      const pick = voices.find(v => v.name === 'Google US English')
                || voices.find(v => v.name.includes('Google UK English'))
                || voices.find(v => /Samantha|Karen|Moira|Tessa/.test(v.name))
                || voices.find(v => v.lang === 'en-US' && !v.localService)
                || voices.find(v => v.lang?.startsWith('en-'))
                || voices[0]
      if (pick) utt.voice = pick
      window.speechSynthesis.speak(utt)
    }, delay)
    // Pause between sentences: longer after ? and !
    delay += 50 + (sentence.endsWith('?') || sentence.endsWith('!') ? 200 : 100)
  })
}
// ── Code Reviewer Panel ───────────────────────────────────────────────────────
function CodeReviewer() {
  const [code, setCode]     = useState('')
  const [lang, setLang]     = useState('auto')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const LANGS = ['auto','javascript','python','typescript','go','rust','java','php','c','cpp','bash','sql']

  const review = async () => {
    if (!code.trim()) return
    setLoading(true); setResult(null)
    try {
      const r = await fetch(`${BASE}/ai/chat`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          message: `Review this ${lang === 'auto' ? '' : lang} code for security vulnerabilities, bugs, and best practice issues. Be specific with line references. Format: list issues with severity (Critical/High/Medium/Low), what it is, and exact fix.\n\nCode:\n${code}`,
          history: [],
          include_system_context: false
        })
      })
      const d = await r.json()
      setResult(d.reply || 'No response from AI.')
    } catch {
      setResult('Cannot reach AI. Make sure Ollama is running.')
    }
    setLoading(false)
  }

  const SEV_COLOR = { 'Critical':'var(--red)', 'High':'#fb923c', 'Medium':'var(--amber)', 'Low':'var(--green)' }

  // Parse result into structured items if possible
  const lines = (result || '').split('\n').filter(l => l.trim())

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ color:'var(--text2)', fontSize:12, textTransform:'uppercase', letterSpacing:'.08em' }}>Language:</span>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {LANGS.map(l => (
            <button key={l} onClick={() => setLang(l)}
              style={{ background:lang===l?'rgba(0,229,160,.15)':'transparent', color:lang===l?'var(--green)':'var(--text3)', border:`1px solid ${lang===l?'var(--green)':'var(--border)'}`, borderRadius:4, padding:'2px 8px', fontSize:11, cursor:'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={code} onChange={e => setCode(e.target.value)}
        placeholder="Paste your code here for security review…"
        style={{ width:'100%', minHeight:160, background:'var(--bg)', border:'1px solid var(--border2)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontFamily:'var(--mono)', fontSize:12, resize:'vertical', lineHeight:1.6, boxSizing:'border-box' }}
      />

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={review} disabled={loading || !code.trim()}
          style={{ background:!loading&&code.trim()?'var(--green)':'var(--bg3)', color:!loading&&code.trim()?'#000':'var(--text3)', border:'none', borderRadius:6, padding:'9px 20px', fontSize:13, fontWeight:600, cursor: loading||!code.trim()?'default':'pointer', transition:'all .2s' }}>
          {loading ? '⏳ Reviewing…' : '🔍 Review Code'}
        </button>
        {code && <button onClick={() => { setCode(''); setResult(null) }}
          style={{ background:'transparent', color:'var(--text3)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 14px', fontSize:12 }}>Clear</button>}
      </div>

      {result && (
        <div style={{ background:'var(--bg)', border:'1px solid var(--border2)', borderRadius:8, padding:'12px 14px' }}>
          <div style={{ color:'var(--text2)', fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Review Results</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {lines.map((line, i) => {
              const sevMatch = Object.keys(SEV_COLOR).find(s => line.includes(s))
              const col = sevMatch ? SEV_COLOR[sevMatch] : 'var(--text2)'
              return (
                <div key={i} style={{ color: col, fontSize:12, lineHeight:1.6, fontFamily: line.startsWith(' ') || line.startsWith('\t') ? 'var(--mono)' : 'var(--sans)', padding:'2px 0', borderLeft: sevMatch ? `2px solid ${col}` : 'none', paddingLeft: sevMatch ? 8 : 0 }}>
                  {line}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── PARTH Chat — Live voice, natural feel ─────────────────────────────────────
function PARTHChat({ compact = false }) {
  const [mode, setMode]             = useState('text')    // 'text' | 'live'
  const [input, setInput]           = useState('')
  const [msgs, setMsgs]             = useState([{ r:'a', t:`I'm online. Talk to me — ask anything, open apps, or review your code.`, ts: new Date() }])
  const [loading, setLoading]       = useState(false)
  const [listening, setListening]   = useState(false)
  const [speaking, setSpeaking]     = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [showReviewer, setShowReviewer] = useState(false)
  const [interimText, setInterimText]   = useState('')    // live transcript
  const [micError, setMicError]     = useState('')
  const recogRef  = useRef(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const isSpeakingRef = useRef(false)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs, interimText])

  // Track speaking state for visual feedback
  const speak = (text) => {
    if (!('speechSynthesis' in window) || !_ttsUnlocked) return
    setSpeaking(true)
    isSpeakingRef.current = true
    window.speechSynthesis.cancel()

    const sentences = text.replace(/[#*`_>[\]]/g, '').split(/(?<=[.!?])\s+/).filter(s => s.trim())
    let utterances = sentences.map(sentence => {
      const utt = new SpeechSynthesisUtterance(sentence.trim())
      utt.rate  = 0.88 + Math.random() * 0.08
      utt.pitch = 1.0  + Math.random() * 0.1 - 0.05
      utt.volume = 1.0
      const voices = window.speechSynthesis.getVoices()
      const pick = voices.find(v => v.name === 'Google US English')
                || voices.find(v => v.name.includes('Google UK English'))
                || voices.find(v => /Samantha|Karen|Moira/.test(v.name))
                || voices.find(v => v.lang === 'en-US' && !v.localService)
                || voices.find(v => v.lang?.startsWith('en'))
                || voices[0]
      if (pick) utt.voice = pick
      return utt
    })

    // Chain utterances with small gaps
    const speakChain = (arr) => {
      if (!arr.length || !isSpeakingRef.current) { setSpeaking(false); return }
      const utt = arr[0]
      utt.onend = () => {
        setTimeout(() => speakChain(arr.slice(1)), 80)
      }
      utt.onerror = () => { setSpeaking(false); speakChain(arr.slice(1)) }
      window.speechSynthesis.speak(utt)
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length) speakChain(utterances)
    else {
      window.speechSynthesis.onvoiceschanged = () => {
        // Re-assign voices now they're loaded
        utterances.forEach(utt => {
          const vs = window.speechSynthesis.getVoices()
          const pick = vs.find(v => v.name === 'Google US English')
                    || vs.find(v => v.lang?.startsWith('en'))
                    || vs[0]
          if (pick) utt.voice = pick
        })
        speakChain(utterances)
        window.speechSynthesis.onvoiceschanged = null
      }
    }
  }

  const stopSpeaking = () => {
    isSpeakingRef.current = false
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  const addMsg = useCallback((r, t) => setMsgs(m => [...m, { r, t, ts: new Date() }]), [])

  const EASTER   = ['boom shaka laka','boomshakala','boom shakala']
  const IDENTITY = ['who are you','who r you','what are you','your name','who is parth','introduce yourself']
  const CREATOR  = ['who made you','who created you','your creator','who made parth']
  const FILE_INT = ['open file editor','write file','create file','open editor','make a file']
  const CODE_INT = ['review code','check code','review my code','scan code','code review']
  const TIME_INT = ['what time','current time','what is the time']
  const DATE_INT = ['what date','what day','today\'s date','what is today']
  const GREET    = ['hello','hi parth','hey parth','good morning','good evening','good night','good afternoon']
  const HOW_INT  = ['how are you','how r you','are you okay','you good']
  const THANKS   = ['thank you','thanks','thank u','thanks parth']
  const JOKE_INT = ['tell me a joke','joke please','say a joke']
  const STOP_INT = ['stop','be quiet','shut up','stop talking','silence','pause']

  const send = useCallback(async (txt) => {
    const msg = (txt || input).trim()
    if (!msg || loading) return
    setInput(''); setInterimText(''); setMicError('')
    const low = msg.toLowerCase()

    const reply_speak = (r) => { addMsg('u', msg); addMsg('a', r); speak(r) }

    if (STOP_INT.some(e => low.includes(e))) { stopSpeaking(); return }
    if (EASTER.some(e => low.includes(e))) { reply_speak('Hukum mera aaka! 🫡'); return }
    if (IDENTITY.some(e => low.includes(e))) { reply_speak(`I'm PARTH — your personal AI assistant and defender, built by ${PARTH_CREATOR}. I monitor your system, open apps, review code, and answer anything. What do you need?`); return }
    if (CREATOR.some(e => low.includes(e))) { reply_speak(`PARTH was built by ${PARTH_CREATOR}.`); return }
    if (FILE_INT.some(e => low.includes(e))) { addMsg('u',msg); addMsg('a','File editor is open below.'); setShowEditor(true); speak('File editor is open.'); return }
    if (CODE_INT.some(e => low.includes(e))) { addMsg('u',msg); addMsg('a','Code reviewer opened. Paste your code below.'); setShowReviewer(true); speak('Paste your code in the reviewer below.'); return }
    if (TIME_INT.some(e => low.includes(e))) { reply_speak(`It's ${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}.`); return }
    if (DATE_INT.some(e => low.includes(e))) { reply_speak(`Today is ${new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.`); return }
    if (GREET.some(e => low.includes(e))) {
      const hr = new Date().getHours()
      reply_speak(`${hr<12?'Good morning':hr<17?'Good afternoon':hr<21?'Good evening':'Good night'}! I'm here. What do you need?`); return
    }
    if (HOW_INT.some(e => low.includes(e))) { reply_speak(`All systems running smoothly. Monitoring your PC. What can I do for you?`); return }
    if (THANKS.some(e => low.includes(e))) { reply_speak(`Always here for you.`); return }
    if (JOKE_INT.some(e => low.includes(e))) {
      const jokes = [
        'Why do programmers prefer dark mode? Because light attracts bugs.',
        'A SQL query walks into a bar, walks up to two tables and asks — can I join you?',
        'Why was the JavaScript developer sad? Because he didn\'t know how to Node his feelings.',
        'I told my computer I needed a break. Now it keeps sending me ads for vacations.',
      ]
      reply_speak(jokes[Math.floor(Math.random()*jokes.length)]); return
    }

    addMsg('u', msg); setLoading(true)
    try {
      const res = await fetch(`${BASE}/ai/command`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message: msg })
      })
      const d = await res.json()
      const reply = d.reply || 'No response.'
      addMsg('a', reply)
      if (mode === 'live' || d.type === 'command') speak(reply)
    } catch {
      addMsg('a', 'Backend offline. Run: bash scripts/start.sh')
    }
    setLoading(false)
  }, [input, loading, mode])

  // ── Live voice mode — continuous, no button hold ──────────────────────────
  const startLive = async () => {
    if (!SR) { setMicError('Speech not supported. Use Chrome or Edge.'); return }
    setMicError('')

    // Request mic permission explicitly first (fixes mobile)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Mic blocked. In your browser: tap the 🔒 lock icon → Site settings → Microphone → Allow. Then try again.')
      } else if (err.name === 'NotFoundError') {
        setMicError('No microphone found on this device.')
      } else if (err.name === 'NotSupportedError') {
        setMicError('Microphone not supported. For phone access, PARTH needs HTTPS. Open http://YOUR-PC-IP:5173 on Chrome.')
      } else {
        setMicError(`Mic error: ${err.message}`)
      }
      return
    }

    const r = new SR()
    r.lang = 'en-US'
    r.continuous     = true   // keep listening
    r.interimResults = true   // show live transcript

    r.onstart  = () => { setListening(true) }
    r.onend    = () => {
      // Auto-restart if still in live mode
      if (recogRef.current && mode === 'live') {
        try { r.start() } catch {}
      } else {
        setListening(false); setInterimText('')
      }
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed') setMicError('Mic blocked. Allow in browser settings.')
      else if (e.error === 'no-speech') {} // ignore, auto-restarts
      else if (e.error === 'network') setMicError('Network error with speech service.')
      else if (e.error !== 'aborted') setMicError(`Speech error: ${e.error}`)
    }
    r.onresult = (e) => {
      let interim = ''; let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setInterimText(interim)
      if (final.trim()) {
        setInterimText('')
        // Don't send while PARTH is speaking
        if (!isSpeakingRef.current) send(final.trim())
      }
    }

    recogRef.current = r
    try { r.start() } catch(e) { setMicError(`Could not start microphone: ${e.message}`) }
  }

  const stopLive = () => {
    recogRef.current?.stop()
    recogRef.current = null
    setListening(false); setInterimText('')
  }

  const chatH = compact ? 200 : 300

  return (
    <div style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:10, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'var(--bg4)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Avatar — pulses green when speaking */}
          <div style={{ position:'relative' }}>
            <div style={{ width:34, height:34, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%,#00e5a0,#003d2a)', border:`2px solid ${speaking?'var(--green)':'var(--border2)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:900, color:'#000', boxShadow:speaking?'0 0 20px rgba(0,229,160,.8)':'0 0 10px rgba(0,229,160,.3)', transition:'all .3s' }}>P</div>
            {speaking && (
              <div style={{ position:'absolute', inset:-4, borderRadius:'50%', border:'2px solid rgba(0,229,160,.4)', animation:'pulse 1s infinite' }}/>
            )}
            {listening && !speaking && (
              <div style={{ position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%', background:'var(--red)', border:'2px solid var(--bg4)', animation:'pulse .8s infinite' }}/>
            )}
          </div>
          <div>
            <div style={{ color:'var(--text)', fontSize:13, fontWeight:700 }}>PARTH</div>
            <div style={{ fontSize:9, fontFamily:'var(--mono)', letterSpacing:'.12em', color: speaking?'var(--green)':listening?'var(--red)':'var(--text3)' }}>
              {speaking ? '● SPEAKING' : listening ? '● LISTENING' : '● STANDBY'}
            </div>
          </div>
        </div>

        <div style={{ display:'flex', gap:4, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {speaking && (
            <button onClick={stopSpeaking}
              style={{ background:'rgba(255,56,96,.15)', color:'var(--red)', border:'1px solid rgba(255,56,96,.4)', borderRadius:5, padding:'3px 9px', fontSize:11 }}>⏹ Stop</button>
          )}
          <button onClick={() => setShowReviewer(e=>!e)}
            style={{ background:showReviewer?'rgba(0,229,160,.15)':'transparent', color:showReviewer?'var(--green)':'var(--text3)', border:`1px solid ${showReviewer?'var(--green)':'var(--border)'}`, borderRadius:5, padding:'3px 9px', fontSize:11 }}>🔍 Code</button>
          <button onClick={() => setShowEditor(e=>!e)}
            style={{ background:showEditor?'rgba(0,229,160,.15)':'transparent', color:showEditor?'var(--green)':'var(--text3)', border:`1px solid ${showEditor?'var(--green)':'var(--border)'}`, borderRadius:5, padding:'3px 9px', fontSize:11 }}>📄 Files</button>
          {/* Mode toggle */}
          <button onClick={() => { unlockTTS(); setMode(m => m==='live'?(stopLive(),'text'):(startLive(),'live')) }}
            style={{ background:mode==='live'?'rgba(255,56,96,.2)':'rgba(0,229,160,.1)', color:mode==='live'?'var(--red)':'var(--green)', border:`1px solid ${mode==='live'?'rgba(255,56,96,.5)':'rgba(0,229,160,.3)'}`, borderRadius:5, padding:'3px 10px', fontSize:11, fontWeight:600, animation:mode==='live'?'pulse 2s infinite':'none' }}>
            {mode==='live' ? '🔴 Live On' : '🎤 Go Live'}
          </button>
        </div>
      </div>

      {/* Live voice visualizer */}
      {listening && (
        <div style={{ padding:'8px 14px', background:'rgba(255,56,96,.05)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:3, alignItems:'center' }}>
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} style={{ width:3, background:'var(--red)', borderRadius:2, animation:`pulse ${0.4+i*0.08}s ${i*0.05}s infinite`, height: `${8 + Math.sin(i)*6}px` }}/>
            ))}
          </div>
          <span style={{ color:'var(--text2)', fontSize:12, fontFamily:'var(--mono)', flex:1 }}>
            {interimText || 'Listening…'}
          </span>
        </div>
      )}

      {/* Mic error */}
      {micError && (
        <div style={{ padding:'8px 14px', background:'rgba(255,56,96,.08)', borderBottom:'1px solid rgba(255,56,96,.2)' }}>
          <div style={{ color:'var(--red)', fontSize:12 }}>⚠ {micError}</div>
          {micError.includes('HTTPS') && (
            <div style={{ color:'var(--text3)', fontSize:11, marginTop:4 }}>
              On mobile, open Chrome → Settings → Site Settings → Microphone → Allow for this site. Or use the text input below.
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div style={{ height:chatH, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {msgs.map((m,i) => (
          <div key={i} style={{ display:'flex', justifyContent:m.r==='u'?'flex-end':'flex-start', gap:8, alignItems:'flex-end', animation:'fadeIn .2s ease' }}>
            {m.r==='a' && (
              <div style={{ width:22, height:22, borderRadius:'50%', background:'radial-gradient(circle,#00e5a0,#003d2a)', border:'1px solid var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#000', flexShrink:0 }}>P</div>
            )}
            <div style={{
              maxWidth:'78%', padding:'9px 13px', fontSize:13, lineHeight:1.6,
              background: m.r==='u'
                ? 'linear-gradient(135deg,rgba(77,184,255,.14),rgba(77,184,255,.07))'
                : 'linear-gradient(135deg,var(--bg4),rgba(0,229,160,.03))',
              border: `1px solid ${m.r==='u'?'rgba(77,184,255,.3)':'rgba(0,229,160,.12)'}`,
              borderRadius: m.r==='u' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
              color:'var(--text)', wordBreak:'break-word',
              boxShadow: m.r==='a' ? '0 2px 16px rgba(0,0,0,.25)' : 'none',
            }}>
              {m.t}
              {m.r==='a' && (
                <button onClick={() => speak(m.t)}
                  style={{ display:'block', marginTop:5, background:'transparent', color:'var(--text3)', border:'none', fontSize:10, cursor:'pointer', padding:0, letterSpacing:'.05em' }}>
                  🔊 replay
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:22, height:22, borderRadius:'50%', background:'radial-gradient(circle,#00e5a0,#003d2a)', border:'1px solid var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#000' }}>P</div>
            <div style={{ background:'var(--bg4)', border:'1px solid rgba(0,229,160,.15)', borderRadius:'4px 14px 14px 14px', padding:'10px 16px', display:'flex', gap:5, alignItems:'center' }}>
              {[0,1,2].map(j => <span key={j} style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)', display:'block', animation:`pulse 1s ${j*.2}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Text input — always visible even in live mode */}
      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', background:'var(--bg4)', display:'flex', gap:6, alignItems:'center' }}>
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); unlockTTS(); send() } }}
          onClick={unlockTTS}
          placeholder={listening ? '🔴 Live — speak or type…' : 'Ask PARTH anything…'}
          style={{ flex:1, background:'var(--bg)', border:`1px solid ${listening?'rgba(255,56,96,.5)':'var(--border2)'}`, borderRadius:8, padding:'9px 12px', color:'var(--text)', fontFamily:'var(--sans)', fontSize:13, transition:'border .2s' }}
        />
        <button onClick={() => { unlockTTS(); send() }} disabled={loading||!input.trim()}
          style={{ width:38, height:38, borderRadius:'50%', flexShrink:0, background:(!loading&&input.trim())?'var(--green)':'var(--bg)', border:`2px solid ${(!loading&&input.trim())?'var(--green)':'var(--border2)'}`, color:(!loading&&input.trim())?'#000':'var(--text3)', fontSize:18, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}>↑</button>
      </div>

      {showReviewer && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'12px 14px', background:'var(--bg)' }}>
          <div style={{ color:'var(--text2)', fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>🔍 Code Security Reviewer</div>
          <CodeReviewer/>
        </div>
      )}
      {showEditor && <div style={{ borderTop:'1px solid var(--border)' }}><FileEditor onClose={()=>setShowEditor(false)}/></div>}
    </div>
  )
}

// ── MOBILE ────────────────────────────────────────────────────────────────────
// ── MOBILE ────────────────────────────────────────────────────────────────────
const MOB_TABS = [
  { id:'home',    icon:'⬡',  label:'Home'   },
  { id:'events',  icon:'⚡',  label:'Events' },
  { id:'chat',    icon:'◈',   label:'PARTH'  },
  { id:'defense', icon:'🛡',  label:'Defense'},
  { id:'more',    icon:'⋯',   label:'More'   },
]

function MobileApp({ events, stats, connected }) {
  const [tab,setTab]       = useState('home')
  const [sub,setSub]       = useState('network')
  const [theme, setTheme]  = useState(() => localStorage.getItem('parth_theme') || 'dark')

  useEffect(() => {
    document.body.classList.toggle('parth-light', theme === 'light')
    localStorage.setItem('parth_theme', theme)
  }, [theme])

  const alertCount = events.filter(e=>['critical','high'].includes(e.severity)&&!['system_metrics','listening_ports_snapshot'].includes(e.event_type)).length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'var(--bg2)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:7, background:'var(--bg4)', border:'1px solid var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'var(--gold)', fontFamily:'var(--deva)', boxShadow:'var(--glow-gold)' }}>प</div>
          <div>
            <div style={{ color:'var(--text)', fontWeight:800, letterSpacing:'.1em', fontSize:14 }}>PARTH</div>
            <div style={{ color:connected?'var(--green)':'var(--red)', fontSize:9, fontFamily:'var(--mono)', letterSpacing:'.1em' }}>● {connected?'LIVE':'OFFLINE'}</div>
          </div>
        </div>
        {alertCount>0 && <div style={{ background:'var(--red)', color:'#fff', borderRadius:20, fontSize:11, padding:'3px 10px', fontFamily:'var(--mono)', fontWeight:700, boxShadow:'var(--glow-r)', animation:'pulse 2s infinite' }}>⚠ {alertCount}</div>}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
        {tab==='home' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {stats && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  {l:'CPU',    v:stats.cpu_percent,    u:'%', w:80, c:'var(--blue)'},
                  {l:'RAM',    v:stats.mem_percent,    u:'%', w:85, c:'var(--purple)'},
                  {l:'DISK',   v:stats.disk_percent,   u:'%', w:90, c:'var(--amber)'},
                  {l:'THREATS',v:(stats.event_counts?.critical||0)+(stats.event_counts?.high||0), u:'', w:1, c:'var(--red)'},
                ].map(s=>(
                  <div key={s.l} style={{ background:'var(--bg3)', border:`1px solid ${s.v>=s.w?s.c+'33':'var(--border)'}`, borderRadius:10, padding:'12px', textAlign:'center', boxShadow:s.v>=s.w?`0 0 15px ${s.c}22`:'none' }}>
                    <div style={{ fontSize:26, fontWeight:800, color:s.v>=s.w?s.c:'var(--text)', fontFamily:'var(--mono)', lineHeight:1 }}>{typeof s.v==='number'?s.v.toFixed(0):s.v}{s.u}</div>
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:4, letterSpacing:'.1em' }}>{s.l}</div>
                    {s.u==='%' && <div style={{ marginTop:6, height:2, background:'var(--border)', borderRadius:1 }}><div style={{ width:`${Math.min(s.v,100)}%`, height:'100%', background:s.v>=s.w?s.c:'var(--border2)', borderRadius:1, transition:'width .5s' }}/></div>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'12px' }}>
              <div style={{ color:'var(--text2)', fontSize:11, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>⚡ Recent Threats</div>
              <EventFeed events={events.filter(e=>['critical','high'].includes(e.severity)).slice(0,6)}/>
              {alertCount===0 && <div style={{ color:'var(--green)', fontSize:12, textAlign:'center', padding:'12px 0', fontFamily:'var(--mono)' }}>✓ NO ACTIVE THREATS</div>}
            </div>
          </div>
        )}
        {tab==='events'  && <EventFeed events={events.slice(0,80)}/>}
        {tab==='chat'    && <PARTHChat compact/>}
        {tab==='defense' && <DefensePanel/>}
        {tab==='more'    && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[{id:'network',l:'🌐 Net'},{id:'scan',l:'🔍 Scan'},{id:'procs',l:'⚙ Procs'},{id:'screen',l:'⊙ Screen'},{id:'settings',l:'◈ Settings'},{id:'dev',l:'🛠 Dev'}].map(t=>(
                <button key={t.id} onClick={()=>setSub(t.id)} style={{ background:sub===t.id?'var(--bg4)':'var(--bg3)', color:sub===t.id?'var(--text)':'var(--text3)', border:`1px solid ${sub===t.id?'var(--border2)':'var(--border)'}`, borderRadius:6, padding:'6px 12px', fontSize:12 }}>{t.l}</button>
              ))}
            </div>
            {sub==='network'  && <ConnectionsPanel/>}
            {sub==='scan'     && <ScanPanel/>}
            {sub==='procs'    && <ProcessTable/>}
            {sub==='screen'   && <ScreenCapture/>}
            {sub==='settings' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--text)', fontSize:13 }}>{theme==='dark'?'🌙 Dark Mode':'☀️ Light Mode'}</span>
                  <button onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} style={{ padding:'6px 14px', borderRadius:7, fontSize:11, fontWeight:600, background:'var(--bg4)', color:'var(--gold)', border:'1px solid var(--border2)', cursor:'pointer' }}>
                    Switch to {theme==='dark'?'Light':'Dark'}
                  </button>
                </div>
                <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg4)', color:'var(--text2)', fontSize:11, textTransform:'uppercase', letterSpacing:'.08em' }}>🤖 AI Model</div>
                  <div style={{ padding:'12px' }}><ModelSettings /></div>
                </div>
                <AlertsConfig/>
              </div>
            )}
            {sub==='dev'      && <DevTools/>}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ display:'flex', background:'var(--bg2)', borderTop:'1px solid var(--border)', flexShrink:0 }}>
        {MOB_TABS.map(t=>(
          <button key={t.id} onClick={()=>{unlockTTS();setTab(t.id)}}
            style={{ flex:1, padding:'10px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:2, background:'transparent', border:'none', color:tab===t.id?'var(--green)':'var(--text3)', position:'relative', transition:'color .2s' }}>
            <span style={{ fontSize:16 }}>{t.icon}</span>
            <span style={{ fontSize:9, letterSpacing:'.04em', fontFamily:'var(--mono)' }}>{t.label}</span>
            {tab===t.id && <div style={{ position:'absolute', bottom:0, left:'20%', right:'20%', height:2, background:'var(--green)', borderRadius:2 }}/>}
            {t.id==='events'&&alertCount>0&&<span style={{ position:'absolute', top:5, right:'22%', background:'var(--red)', color:'#fff', borderRadius:8, fontSize:8, padding:'1px 4px', fontWeight:700 }}>{alertCount}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── DESKTOP ───────────────────────────────────────────────────────────────────
const DESK_TABS = [
  {id:'Dashboard',     icon:'⬡'},
  {id:'Events',        icon:'⚡'},
  {id:'Timeline',      icon:'◷'},
  {id:'Processes',     icon:'⚙'},
  {id:'Network',       icon:'🌐'},
  {id:'Defense',       icon:'🛡'},
  {id:'AI Assistant',  icon:'◈'},
  {id:'Screen',        icon:'⊙'},
  {id:'Scan',          icon:'🔍'},
  {id:'Dev Tools',     icon:'🛠'},
  {id:'Settings',      icon:'⚙'},
]

function DesktopApp({ events, stats, connected, statsError, server, onChangeServer }) {
  const [tab,setTab]       = useState('Dashboard')
  const [toasts,setToasts] = useState([])
  const [theme, setTheme]  = useState(() => localStorage.getItem('parth_theme') || 'dark')

  useEffect(() => {
    document.body.classList.toggle('parth-light', theme === 'light')
    localStorage.setItem('parth_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  useEffect(()=>{
    const last=events[0]; if(!last) return
    if(['cpu_spike','mem_spike','disk_spike'].includes(last.event_type)){
      const t={id:Date.now(), msg:last.data?.message||last.event_type, sev:last.severity}
      setToasts(ts=>[t,...ts].slice(0,3))
      setTimeout(()=>setToasts(ts=>ts.filter(x=>x.id!==t.id)),7000)
    }
  },[events[0]?.id])

  const alertCount=events.filter(e=>['critical','high'].includes(e.severity)&&!['system_metrics','listening_ports_snapshot'].includes(e.event_type)).length

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', position:'relative', zIndex:1 }}>
      {/* Toasts */}
      <div style={{ position:'fixed', top:16, right:16, zIndex:9999, display:'flex', flexDirection:'column', gap:8 }}>
        {toasts.map(t=>(
          <div key={t.id} style={{ background:t.sev==='critical'?'rgba(255,56,96,.95)':'rgba(255,140,66,.95)', color:'#fff', borderRadius:8, padding:'10px 16px', fontSize:12, fontFamily:'var(--mono)', maxWidth:340, boxShadow:'0 4px 24px rgba(0,0,0,.5)', animation:'slideIn .3s ease', display:'flex', alignItems:'center', gap:8 }}>
            ⚠ {t.msg}
          </div>
        ))}
      </div>

      {/* ── Vertical Sidebar ── */}
      <aside className="sidebar" style={{
        width: sidebarCollapsed ? 60 : 200,
        minWidth: sidebarCollapsed ? 60 : 200,
        height:'100vh', display:'flex', flexDirection:'column',
        background:'var(--sidebar-bg)', borderRight:'1px solid var(--sidebar-border)',
        transition:'width .25s ease, min-width .25s ease', overflow:'hidden',
        position:'relative', zIndex:20, flexShrink:0
      }}>
        {/* Mandala top decoration */}
        <div className="sidebar-mandala" aria-hidden="true"/>

        {/* Logo */}
        <div style={{ padding: sidebarCollapsed ? '18px 0 14px' : '18px 16px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--sidebar-border)', flexShrink:0 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--sidebar-logo-bg)', border:'2px solid var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:900, color:'var(--gold)', boxShadow:'0 0 14px var(--gold-glow)', flexShrink:0, marginLeft: sidebarCollapsed ? 12 : 0 }}>
            प
          </div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ color:'var(--gold)', fontFamily:'var(--mono)', fontWeight:700, letterSpacing:'.15em', fontSize:15, lineHeight:1 }}>PARTH</div>
              <div style={{ color:'var(--text3)', fontSize:8, letterSpacing:'.15em', marginTop:2 }}>HOST-DEFENDER v1.0</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'10px 0' }}>
          {DESK_TABS.map(t=>{
            const isActive = tab === t.id
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} title={sidebarCollapsed ? t.id : undefined}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:10,
                  padding: sidebarCollapsed ? '11px 0' : '11px 16px',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                  borderLeft: `3px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
                  borderRight:'none', borderTop:'none', borderBottom:'none',
                  color: isActive ? 'var(--gold)' : 'var(--text3)',
                  fontSize:12, fontWeight: isActive ? 600 : 400,
                  transition:'all .18s', cursor:'pointer', position:'relative',
                  letterSpacing:'.04em'
                }}>
                <span style={{ fontSize:15, flexShrink:0 }}>{t.icon}</span>
                {!sidebarCollapsed && <span>{t.id}</span>}
                {t.id==='Events' && alertCount>0 && (
                  <span style={{ position: sidebarCollapsed ? 'absolute' : 'static', top: sidebarCollapsed ? 6 : 'auto', right: sidebarCollapsed ? 6 : 'auto', marginLeft:'auto', background:'var(--red)', color:'#fff', borderRadius:8, fontSize:8, padding:'1px 5px', fontFamily:'var(--mono)', fontWeight:700, animation:'pulse 2s infinite' }}>
                    {alertCount>99?'99+':alertCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Sidebar footer — status + server */}
        <div style={{ borderTop:'1px solid var(--sidebar-border)', padding: sidebarCollapsed ? '10px 0' : '10px 14px', flexShrink:0 }}>
          {/* Connection status */}
          <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', marginBottom: sidebarCollapsed ? 0 : 8 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:connected?'var(--green)':'var(--red)', animation:connected?'pulse 2s infinite':'none', flexShrink:0 }}/>
            {!sidebarCollapsed && <span style={{ color:connected?'var(--green)':'var(--red)', fontSize:10, fontFamily:'var(--mono)', letterSpacing:'.1em' }}>{connected?'LIVE':'OFFLINE'}</span>}
          </div>
          {!sidebarCollapsed && (
            <>
              {statsError && <div style={{ color:'var(--red)', fontSize:9, marginBottom:6 }}>⚠ BACKEND OFFLINE</div>}
              {server && <div style={{ color:'var(--text3)', fontSize:9, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{server.name}</div>}
              <button onClick={onChangeServer} style={{ width:'100%', background:'var(--bg4)', color:'var(--text3)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:10, cursor:'pointer' }}>⇄ Switch Server</button>
            </>
          )}
        </div>

        {/* Collapse toggle */}
        <button onClick={()=>setSidebarCollapsed(v=>!v)} style={{ background:'var(--sidebar-bg)', color:'var(--text3)', border:'none', borderTop:'1px solid var(--sidebar-border)', padding:'8px 0', fontSize:14, cursor:'pointer', flexShrink:0 }}>
          {sidebarCollapsed ? '›' : '‹'}
        </button>

        {/* Bottom lotus decoration */}
        <div className="sidebar-lotus" aria-hidden="true"/>
      </aside>

      {/* ── Main content area ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Thin top bar — page title only */}
        <div style={{ height:44, background:'var(--topbar-bg)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 20px', flexShrink:0, justifyContent:'space-between' }}>
          <span style={{ color:'var(--gold)', fontSize:11, fontFamily:'var(--mono)', letterSpacing:'.12em', textTransform:'uppercase' }}>{tab}</span>
          <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{ background:'var(--bg4)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:7, padding:'5px 12px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6, transition:'all .2s' }}>
            <span style={{ fontSize:14 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.06em' }}>{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
          </button>
        </div>

        {/* Scrollable main */}
        <main style={{ flex:1, overflow:'auto', padding:16 }}>
        {tab==='Dashboard' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:1400 }}>
            <StatCards stats={stats}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <ThreatSummary/>
              <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ color:'var(--text2)', fontSize:11, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>⚡ Live Alert Feed</div>
                <div style={{ maxHeight:230, overflowY:'auto' }}><EventFeed events={events.slice(0,30)}/></div>
              </div>
            </div>
            <PARTHChat/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <ConnectionsPanel/><ScanPanel/>
            </div>
          </div>
        )}
        {tab==='Events'    && <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 4px', maxHeight:'calc(100vh-120px)', overflowY:'auto' }}><EventFeed events={events}/></div>}
        {tab==='Timeline'  && <TimelineView events={events}/>}
        {tab==='Processes' && <ProcessTable/>}
        {tab==='Network'   && <ConnectionsPanel/>}
        {tab==='Defense'   && (
          <div style={{ maxWidth:700 }}>
            <div style={{ color:'var(--text2)', fontSize:11, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:14 }}>🛡 Defense & Response Tools</div>
            <DefensePanel/>
          </div>
        )}
        {tab==='Scan'         && <ScanPanel/>}
        {tab==='Screen'       && <ScreenCapture/>}
        {tab==='Dev Tools'    && <DevTools/>}
        {tab==='AI Assistant' && <AIAssistant/>}
        {tab==='Settings'     && (
          <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:720 }}>
            {/* Theme toggle card */}
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'var(--bg4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                {theme === 'dark' ? '🌙' : '☀️'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ color:'var(--text)', fontWeight:600, fontSize:13 }}>Interface Theme</div>
                <div style={{ color:'var(--text3)', fontSize:11, marginTop:2 }}>
                  Currently: <span style={{ color:'var(--gold)', fontFamily:'var(--mono)' }}>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                </div>
              </div>
              <button onClick={toggleTheme} style={{
                padding:'9px 20px', borderRadius:8, fontWeight:600, fontSize:12,
                background: theme === 'dark' ? 'rgba(240,184,64,.12)' : 'rgba(14,9,5,.08)',
                color: theme === 'dark' ? 'var(--amber)' : 'var(--text2)',
                border:`1px solid ${theme === 'dark' ? 'rgba(240,184,64,.3)' : 'var(--border)'}`,
                cursor:'pointer', transition:'all .2s',
              }}>
                {theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}
              </button>
            </div>

            {/* AI Model selector */}
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', background:'var(--bg4)', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:16 }}>🤖</span>
                <div style={{ color:'var(--text)', fontSize:13, fontWeight:700 }}>AI Model Configuration</div>
                <span style={{ marginLeft:'auto', fontSize:9, padding:'2px 8px', borderRadius:20, background:'rgba(0,229,160,.1)', color:'var(--green)', fontFamily:'var(--mono)', border:'1px solid rgba(0,229,160,.2)' }}>OLLAMA</span>
              </div>
              <div style={{ padding:'16px 18px' }}>
                <ModelSettings />
              </div>
            </div>

            {/* Alerts & other settings */}
            <AlertsConfig />
          </div>
        )}
      </main>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
// Inner dashboard — only mounts AFTER server is chosen so hooks use correct BASE
function Dashboard({ server, onChangeServer }) {
  const { events, connected }        = useEventStream()
  const { stats, error: statsError } = useStats(8000)
  const isMobile                     = useIsMobile()

  if (isMobile) return <MobileApp events={events} stats={stats} connected={connected}/>
  return <DesktopApp events={events} stats={stats} connected={connected}
           statsError={statsError} server={server} onChangeServer={onChangeServer}/>
}

export default function App() {
  // Check if start.sh injected a server config
  const autoServer = window.__PARTH_AUTO_SERVER__

  // phase: 'pick' | 'splash' | 'dash'
  const [phase, setPhase]   = useState(() => {
    if (autoServer) {
      applyServer(autoServer)
      return 'splash'  // skip picker when started via start.sh
    }
    const saved = loadActive()
    if (saved) {
      applyServer(saved)
      return 'splash'
    }
    return 'pick'
  })
  const [server, setServer] = useState(() => autoServer || loadActive())

  const pick = (s) => {
    applyServer(s)
    saveActive(s)
    setServer(s)
    setPhase('splash')
  }

  const changeSrv = () => {
    // Clear auto-server so picker shows
    window.__PARTH_AUTO_SERVER__ = null
    saveActive(null)
    setPhase('pick')
  }

  if (phase === 'pick')   return <ServerPicker onConnect={pick}/>
  if (phase === 'splash') return <SplashScreen onEnter={() => setPhase('dash')}/>
  return <Dashboard server={server} onChangeServer={changeSrv}/>
}
