// created_by:pushkar | helped_by:claude | parth-host-defender
// PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
import { useState, useRef, useEffect, useCallback } from 'react'

const BASE  = window.__PARTH_BASE__ || '/api'
const STORE_KEY = 'parth_chat_history_v1'
const MAX_MEMORY = 5   // last N messages fed to model as context
const MAX_STORED = 80  // max messages kept in localStorage

// ── Persist helpers ──────────────────────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    return JSON.parse(raw) || []
  } catch { return [] }
}

function saveHistory(msgs) {
  try {
    // Keep only last MAX_STORED, never store system/error messages
    const toSave = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_STORED)
    localStorage.setItem(STORE_KEY, JSON.stringify(toSave))
  } catch {}
}

// ── TTS ──────────────────────────────────────────────────────────────────────
const hasTTS = 'speechSynthesis' in window
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const hasSpeech = !!SpeechRecognition

function speak(text) {
  if (!hasTTS) return
  window.speechSynthesis.cancel()
  const clean = text.replace(/[#*`_>]/g, '').trim().slice(0, 400)
  if (!clean) return
  const utt = new SpeechSynthesisUtterance(clean)
  utt.rate = 1.0; utt.pitch = 1.0; utt.volume = 0.9
  const voices = window.speechSynthesis.getVoices()
  const pick = voices.find(v => /Google|Natural|Neural|Enhanced|Samantha|Daniel|Karen/.test(v.name))
    || voices.find(v => v.lang?.startsWith('en'))
    || voices[0]
  if (pick) utt.voice = pick
  // Chrome bug: voices may not be loaded yet
  if (voices.length) window.speechSynthesis.speak(utt)
  else window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.speak(utt)
    window.speechSynthesis.onvoiceschanged = null
  }
}

function stopSpeech() { if (hasTTS) window.speechSynthesis.cancel() }

// ── NL Query parser — converts plain English to /api/events params ───────────
// Runs locally, no model needed for basic filters
function parseNLQuery(text) {
  const t = text.toLowerCase()
  const result = {}

  // severity
  if (/\bcritical\b/.test(t)) result.severity = 'critical'
  else if (/\bhigh\b/.test(t)) result.severity = 'high'
  else if (/\bmedium\b/.test(t)) result.severity = 'medium'
  else if (/\blow\b/.test(t)) result.severity = 'low'

  // event type keywords
  if (/\bssh\b/.test(t)) result.event_type = 'ssh_login'
  else if (/\bport[s]?\b/.test(t)) result.event_type = 'port_scan'
  else if (/\bcpu\b/.test(t)) result.event_type = 'cpu_spike'
  else if (/\bmem(ory)?\b/.test(t)) result.event_type = 'mem_spike'
  else if (/\bdisk\b/.test(t)) result.event_type = 'disk_spike'
  else if (/\bprocess(es)?\b/.test(t)) result.event_type = 'process_anomaly'
  else if (/\bnetwork|connect(ion)?\b/.test(t)) result.event_type = 'network_anomaly'
  else if (/\bfile\b/.test(t)) result.event_type = 'file_change'

  // time range
  const hourMatch = t.match(/last\s+(\d+)\s+hour/)
  if (hourMatch) result.since_hours = parseInt(hourMatch[1])
  else if (/today|24h/.test(t)) result.since_hours = 24
  else if (/\bhour\b/.test(t)) result.since_hours = 1
  else if (/\bweek\b/.test(t)) result.since_hours = 168

  // limit
  const limitMatch = t.match(/\b(top|last|show|first)\s+(\d+)\b/)
  if (limitMatch) result.limit = parseInt(limitMatch[2])

  return Object.keys(result).length > 0 ? result : null
}

// Is the message asking to query/filter events?
function isQueryIntent(text) {
  const t = text.toLowerCase()
  return /show\s+(me\s+)?(all\s+)?|list|find|filter|search|get|fetch|display|what\s+(are\s+)?(the\s+)?|any\s+(recent\s+)?/.test(t)
    && /(event|alert|threat|log|activity|connect|process|port|ssh|cpu|mem|disk|network|attack|anomal)/.test(t)
}

// ── Quick prompt chips ────────────────────────────────────────────────────────
const CHIPS = [
  'Show me critical events from last hour',
  'Any SSH activity today?',
  'List high severity alerts',
  'How do I harden SSH?',
  'Show network anomalies',
  'What ports should I close?',
]

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, onSpeak }) {
  const isUser   = msg.role === 'user'
  const isSystem = msg.role === 'system'
  const isQuery  = msg.role === 'query_result'

  const bubbleBg = isUser
    ? 'rgba(232,169,60,.1)'
    : isSystem
    ? 'rgba(224,80,80,.08)'
    : isQuery
    ? 'rgba(126,184,232,.07)'
    : 'var(--bg3)'

  const bubbleBorder = isUser
    ? 'rgba(232,169,60,.25)'
    : isSystem
    ? 'rgba(224,80,80,.25)'
    : isQuery
    ? 'rgba(126,184,232,.2)'
    : 'var(--border)'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10, gap: 8, alignItems: 'flex-end',
    }}>
      {!isUser && (
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'var(--bg4)', border: '1px solid var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--deva)',
        }}>प</div>
      )}
      <div style={{
        maxWidth: '78%',
        background: bubbleBg,
        border: `1px solid ${bubbleBorder}`,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '10px 14px', fontSize: 13,
        color: isSystem ? 'var(--red)' : 'var(--text)',
        lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {isQuery ? (
          <QueryResultDisplay data={msg.content} />
        ) : (
          msg.content
        )}
        {!isUser && !isSystem && !isQuery && (
          <div style={{ marginTop: 6, display: 'flex', gap: 10 }}>
            <button onClick={() => onSpeak(msg.content)} style={{
              background: 'transparent', border: 'none',
              color: 'var(--text3)', fontSize: 11, cursor: 'pointer', padding: 0,
            }} title="Read aloud">🔊</button>
            <button onClick={() => navigator.clipboard?.writeText(msg.content)} style={{
              background: 'transparent', border: 'none',
              color: 'var(--text3)', fontSize: 11, cursor: 'pointer', padding: 0,
            }} title="Copy">⧉ copy</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline query result display ───────────────────────────────────────────────
const SEV_COLOR = {
  critical: 'var(--red)', high: '#f09060',
  medium: 'var(--amber)', low: 'var(--green)', info: 'var(--blue)',
}

function QueryResultDisplay({ data }) {
  if (!data || !data.events) return (
    <span style={{ color: 'var(--text3)', fontSize: 12 }}>No events found.</span>
  )
  const { events, total, params } = data
  return (
    <div>
      <div style={{ color: 'var(--gold)', fontSize: 11, fontFamily: 'var(--mono)', marginBottom: 8, letterSpacing: '.06em' }}>
        ◈ QUERY RESULT — {events.length} of {total} events
        {params?.severity && ` · severity: ${params.severity}`}
        {params?.event_type && ` · type: ${params.event_type}`}
        {params?.since_hours && ` · last ${params.since_hours}h`}
      </div>
      {events.length === 0 && (
        <div style={{ color: 'var(--text3)', fontSize: 12 }}>No matching events.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
        {events.slice(0, 20).map((ev, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '70px 80px 1fr',
            gap: 8, padding: '4px 0',
            borderBottom: '1px solid var(--border)', fontSize: 11,
            fontFamily: 'var(--mono)',
          }}>
            <span style={{ color: 'var(--text3)' }}>
              {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('en-IN', { hour12: false }) : ''}
            </span>
            <span style={{ color: SEV_COLOR[ev.severity?.toLowerCase()] || 'var(--text3)' }}>
              {ev.severity || 'info'}
            </span>
            <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.event_type} {ev.source ? `[${ev.source}]` : ''}
            </span>
          </div>
        ))}
      </div>
      {events.length > 20 && (
        <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 6 }}>
          … and {events.length - 20} more
        </div>
      )}
    </div>
  )
}

// ── Memory indicator ──────────────────────────────────────────────────────────
function MemoryBar({ count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderBottom: '1px solid var(--border)',
      background: 'rgba(232,169,60,.04)', flexShrink: 0,
    }}>
      <span style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '.06em' }}>
        ◈ MEMORY
      </span>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: MAX_MEMORY }).map((_, i) => (
          <div key={i} style={{
            width: 14, height: 4, borderRadius: 2,
            background: i < Math.min(count, MAX_MEMORY)
              ? 'var(--gold)'
              : 'var(--border)',
            transition: 'background .3s',
            opacity: i < Math.min(count, MAX_MEMORY) ? 1 : 0.4,
          }}/>
        ))}
      </div>
      <span style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)' }}>
        {Math.min(count, MAX_MEMORY)}/{MAX_MEMORY} messages in context · stored locally
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AIAssistant() {
  // Load persisted messages from localStorage on first mount
  const [messages, setMessages] = useState(() => {
    const stored = loadHistory()
    if (stored.length > 0) return stored
    return [{
      role: 'assistant',
      content: "Namaste! I'm PARTH, your local AI security assistant. Ask me anything about your system — or use natural language to query events like \"show critical events from last hour\" or \"any SSH activity today?\"\n\nYour chat history is stored locally on your PC.",
    }]
  })

  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [listening, setListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [error, setError]         = useState('')
  // BUG 6 FIX: start empty — /health response fills this, so PARTH_MODEL from .env is used
  const [model, setModel]         = useState('')

  const recogRef  = useRef(null)
  const bottomRef = useRef(null)
  const abortRef  = useRef(false)
  const pendingTextRef = useRef('')
  // BUG 7 FIX: keep latest values in ref so sendMessage closure is always fresh
  const stateRef = useRef({})
  stateRef.current = { input, loading, messages, model, ttsEnabled }

  // BUG 6 FIX: read configured model from backend on mount
  useEffect(() => {
    fetch(`${BASE}/health`)
      .then(r => r.json())
      .then(d => { if (d.model) setModel(d.model) })
      .catch(() => setModel('mistral'))
  }, [])

  // Persist on every message change
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Count real user/assistant messages for memory indicator
  const memoryCount = messages.filter(m => m.role === 'user' || m.role === 'assistant').length

  // ── Build context window — last MAX_MEMORY messages only ──────────────────
  const buildContext = useCallback((allMessages) => {
    return allMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_MEMORY)
      .map(m => ({ role: m.role, content: m.content }))
  }, [])

  // ── NL Query handler ──────────────────────────────────────────────────────
  const handleNLQuery = useCallback(async (text, params) => {
    try {
      const qs = new URLSearchParams({
        limit: params.limit || 30,
        since_hours: params.since_hours || 24,
        ...(params.severity   ? { severity: params.severity }     : {}),
        ...(params.event_type ? { event_type: params.event_type } : {}),
      })
      const r = await fetch(`${BASE}/events?${qs}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      return {
        events: d.events || [],
        total: d.total || (d.events || []).length,
        params,
      }
    } catch (e) {
      return null
    }
  }, [])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (textOverride) => {
    // BUG 7 FIX: read from ref not closure — always fresh values
    const { input: curInput, loading: curLoading, messages: curMessages,
            model: curModel, ttsEnabled: curTts } = stateRef.current
    const msg = (textOverride || curInput).trim()
    if (!msg || curLoading) return

    setInput('')
    setError('')
    abortRef.current = false

    const userMsg = { role: 'user', content: msg }
    const withUser = [...curMessages, userMsg]
    setMessages(withUser)
    setLoading(true)

    if (isQueryIntent(msg)) {
      const params = parseNLQuery(msg)
      if (params) {
        const result = await handleNLQuery(msg, params)
        if (!abortRef.current) {
          setMessages(prev => [...prev, result
            ? { role: 'query_result', content: result }
            : { role: 'system', content: 'Could not reach backend. Is the server running?' }
          ])
        }
        setLoading(false)
        return
      }
    }

    const context = buildContext(withUser)

    try {
      // BUG 8 FIX: AbortController timeout so UI never hangs forever
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60000)

      const r = await fetch(`${BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: msg,
          history: context.slice(0, -1),
          model: curModel || undefined,   // undefined = backend uses PARTH_MODEL from .env
        }),
      })
      clearTimeout(timer)

      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
      const d = await r.json()
      const reply = d.reply || d.response || 'No response received.'

      if (!abortRef.current) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
        if (curTts) speak(reply)
      }
    } catch (e) {
      if (!abortRef.current) {
        const hint = e.name === 'AbortError'
          ? 'Request timed out (60s). Try a smaller model: phi3 or qwen2.5:1.5b'
          : e.message.includes('404')
          ? `Model "${curModel}" not found. Run: ollama pull ${curModel}`
          : e.message.includes('Failed to fetch') || e.message.includes('502')
          ? 'Ollama is not running. Start it with: ollama serve'
          : e.message
        setMessages(prev => [...prev, { role: 'system', content: `Error: ${hint}` }])
      }
    }
    setLoading(false)
  }, [buildContext, handleNLQuery])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Speech recognition — uses ref to avoid stale closure ─────────────────
  const startListening = () => {
    if (!hasSpeech) { setError('Speech not supported. Use Chrome.'); return }
    const recog = new SpeechRecognition()
    recog.continuous = false
    recog.interimResults = false
    recog.lang = 'en-IN' // better for Indian English

    recog.onstart  = () => setListening(true)
    recog.onend    = () => {
      setListening(false)
      // Use ref to avoid stale closure — send whatever was captured
      if (pendingTextRef.current) {
        sendMessage(pendingTextRef.current)
        pendingTextRef.current = ''
      }
    }
    recog.onerror  = (e) => { setListening(false); setError(`Mic: ${e.error}`) }
    recog.onresult = (e) => {
      const t = e.results[0][0].transcript
      pendingTextRef.current = t
      setInput(t)
    }

    recogRef.current = recog
    recog.start()
  }

  const stopListening = () => { recogRef.current?.stop(); setListening(false) }

  const clearChat = () => {
    abortRef.current = true
    stopSpeech()
    const fresh = [{ role: 'assistant', content: 'Chat cleared. History wiped from memory.' }]
    setMessages(fresh)
    localStorage.removeItem(STORE_KEY)
    setError('')
  }

  const hasChips = messages.filter(m => m.role === 'user').length === 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 90px)',
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'var(--bg4)', border: '1px solid var(--gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: 'var(--gold)', fontFamily: 'var(--deva)',
          }}>प</div>
          <div>
            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>PARTH Assistant</div>
            <div style={{ color: 'var(--gold)', fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '.06em' }}>
              ● local · {model}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Model selector */}
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            style={{
              background: 'var(--bg)', color: 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 4,
              padding: '3px 8px', fontSize: 11, fontFamily: 'var(--mono)',
            }}
          >
            {['llama3.2', 'llama3.1', 'mistral', 'gemma2', 'phi3', 'llama2'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <button
            onClick={() => { setTtsEnabled(t => !t); if (ttsEnabled) stopSpeech() }}
            style={{
              background: ttsEnabled ? 'rgba(232,169,60,.12)' : 'transparent',
              color: ttsEnabled ? 'var(--gold)' : 'var(--text3)',
              border: `1px solid ${ttsEnabled ? 'rgba(232,169,60,.3)' : 'var(--border)'}`,
              borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}>
            {ttsEnabled ? '🔊' : '🔇'}
          </button>

          <button onClick={clearChat} style={{
            background: 'transparent', color: 'var(--text3)',
            border: '1px solid var(--border)', borderRadius: 4,
            padding: '3px 10px', fontSize: 11, cursor: 'pointer',
          }}>Clear</button>
        </div>
      </div>

      {/* ── Memory bar ── */}
      <MemoryBar count={memoryCount} />

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} onSpeak={speak} />
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--bg4)', border: '1px solid var(--gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--deva)',
            }}>प</div>
            <div style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: '14px 14px 14px 4px', padding: '10px 16px',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--gold)', display: 'inline-block',
                  animation: `pulse 1.2s ${i * 0.22}s infinite`,
                }}/>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 12, padding: '4px 0', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* ── Quick chips (only before first user message) ── */}
      {hasChips && (
        <div style={{ padding: '0 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
          {CHIPS.map((c, i) => (
            <button key={i} onClick={() => sendMessage(c)} style={{
              background: 'var(--bg2)', color: 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 14,
              padding: '5px 12px', fontSize: 11, cursor: 'pointer',
              transition: 'border-color .15s',
            }}>{c}</button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '10px 14px',
        background: 'var(--bg2)', flexShrink: 0,
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={listening ? '🎤 Listening…' : 'Ask anything or query events… (Enter to send)'}
          rows={1}
          style={{
            flex: 1, background: 'var(--bg)',
            border: `1px solid ${listening ? 'var(--gold)' : 'var(--border2)'}`,
            borderRadius: 6, padding: '8px 12px', color: 'var(--text)',
            fontFamily: 'var(--sans)', fontSize: 13, resize: 'none',
            lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
            transition: 'border-color .2s',
          }}
        />

        {hasSpeech && (
          <button
            onClick={listening ? stopListening : startListening}
            disabled={loading}
            title={listening ? 'Stop' : 'Speak'}
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: listening ? 'rgba(224,80,80,.15)' : 'var(--bg)',
              border: `1.5px solid ${listening ? 'var(--red)' : 'var(--border)'}`,
              color: listening ? 'var(--red)' : 'var(--text3)',
              fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: listening ? 'pulse 1s infinite' : 'none',
              cursor: loading ? 'default' : 'pointer',
              transition: 'all .2s',
            }}>
            {listening ? '⏹' : '🎤'}
          </button>
        )}

        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: (!loading && input.trim()) ? 'rgba(232,169,60,.15)' : 'var(--bg)',
            border: `1.5px solid ${(!loading && input.trim()) ? 'var(--gold)' : 'var(--border)'}`,
            color: (!loading && input.trim()) ? 'var(--gold)' : 'var(--text3)',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: (loading || !input.trim()) ? 'default' : 'pointer',
            transition: 'all .2s',
          }}>↑</button>
      </div>
    </div>
  )
}
