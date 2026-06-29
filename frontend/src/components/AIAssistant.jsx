import { useState, useRef, useEffect } from 'react'

const BASE = window.__PARTH_BASE__ || '/api'

// ── Speech utilities ─────────────────────────────────────────────────────────

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const hasSpeech = !!SpeechRecognition
const hasTTS    = 'speechSynthesis' in window

function speak(text) {
  if (!hasTTS) return
  window.speechSynthesis.cancel()
  // Strip to plain text, limit length for TTS
  const clean = text.replace(/[#*`]/g, '').slice(0, 500)
  const utt = new SpeechSynthesisUtterance(clean)
  utt.rate  = 1.05
  utt.pitch = 1.0
  utt.volume = 0.95
  // Prefer a natural-sounding voice
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v =>
    /Google|Natural|Neural|Enhanced|Samantha|Daniel|Karen/.test(v.name)
  ) || voices[0]
  if (preferred) utt.voice = preferred
  window.speechSynthesis.speak(utt)
}

function stopSpeech() {
  if (hasTTS) window.speechSynthesis.cancel()
}

// ── Quick prompt chips ───────────────────────────────────────────────────────

const CHIPS = [
  'Check my system health',
  'Any suspicious activity?',
  'How do I harden SSH?',
  'Explain iptables basics',
  'What ports should I close?',
  'Scan for open ports',
]

// ── Message bubble ───────────────────────────────────────────────────────────

function Bubble({ msg, onSpeak }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10,
      gap: 8,
      alignItems: 'flex-end',
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #1a2a1a, #0d4a38)',
          border: '1px solid var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: 'var(--green)', fontWeight: 700,
        }}>P</div>
      )}

      <div style={{
        maxWidth: '75%',
        background: isUser ? 'rgba(59,130,246,0.15)' : isSystem ? 'rgba(234,179,8,0.08)' : 'var(--bg3)',
        border: `1px solid ${isUser ? 'rgba(59,130,246,0.3)' : isSystem ? 'rgba(234,179,8,0.2)' : 'var(--border)'}`,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '10px 14px',
        fontSize: 13,
        color: 'var(--text)',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
        {!isUser && !isSystem && (
          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            <button onClick={() => onSpeak(msg.content)} style={{
              background: 'transparent', border: 'none', color: 'var(--text3)',
              fontSize: 11, cursor: 'pointer', padding: 0,
            }} title="Read aloud">🔊</button>
            <button onClick={() => navigator.clipboard.writeText(msg.content)} style={{
              background: 'transparent', border: 'none', color: 'var(--text3)',
              fontSize: 11, cursor: 'pointer', padding: 0,
            }} title="Copy">⧉ copy</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm PARTH, your local AI security assistant. Ask me anything — security advice, system analysis, Linux help, or general questions. I run fully locally on your machine.",
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [error, setError] = useState('')

  const recogRef    = useRef(null)
  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)
  const abortRef    = useRef(false)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Speech Recognition ──────────────────────────────────
  const startListening = () => {
    if (!hasSpeech) { setError('Speech recognition not supported in this browser. Use Chrome.'); return }
    const recog = new SpeechRecognition()
    recog.continuous = false
    recog.interimResults = false
    recog.lang = 'en-US'

    recog.onstart = () => setListening(true)
    recog.onend   = () => setListening(false)
    recog.onerror = (e) => { setListening(false); setError(`Mic error: ${e.error}`) }
    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      setInput(transcript)
      // Auto-send after speech
      setTimeout(() => sendMessage(transcript), 300)
    }

    recogRef.current = recog
    recog.start()
  }

  const stopListening = () => {
    recogRef.current?.stop()
    setListening(false)
  }

  // ── Send message ────────────────────────────────────────
  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    setError('')
    abortRef.current = false

    const userMsg = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)

    // Build history for API (exclude system messages)
    const history = newMessages
      .filter(m => m.role !== 'system')
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const r = await fetch(`${BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: history.slice(0, -1), // history without current message
          include_system_context: true,
        }),
      })

      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const reply = d.reply || 'No response.'

      if (!abortRef.current) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
        if (ttsEnabled) speak(reply)
      }
    } catch (e) {
      const errMsg = `Error: ${e.message}. Make sure Ollama is running (ollama serve).`
      setMessages(prev => [...prev, { role: 'system', content: errMsg }])
    }
    setLoading(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    stopSpeech()
    abortRef.current = true
    setMessages([{
      role: 'assistant',
      content: "Chat cleared. How can I help?",
    }])
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 90px)',
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a2a1a, #0d4a38)',
            border: '1px solid var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: 'var(--green)', fontWeight: 700,
          }}>P</div>
          <div>
            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>PARTH Assistant</div>
            <div style={{ color: 'var(--green)', fontSize: 10, fontFamily: 'var(--mono)' }}>● local · {MODEL || 'ollama'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* TTS toggle */}
          <button onClick={() => { setTtsEnabled(t => !t); if (ttsEnabled) stopSpeech() }}
            title={ttsEnabled ? 'Disable voice' : 'Enable voice'}
            style={{
              background: ttsEnabled ? 'rgba(34,197,94,0.15)' : 'var(--bg)',
              color: ttsEnabled ? 'var(--green)' : 'var(--text3)',
              border: `1px solid ${ttsEnabled ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            }}>
            {ttsEnabled ? '🔊 Voice On' : '🔇 Voice Off'}
          </button>

          <button onClick={clearChat} style={{
            background: 'var(--bg)', color: 'var(--text3)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '4px 10px', fontSize: 12, cursor: 'pointer',
          }}>Clear</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} onSpeak={speak} />
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1a2a1a, #0d4a38)',
              border: '1px solid var(--green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'var(--green)', fontWeight: 700,
            }}>P</div>
            <div style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: '14px 14px 14px 4px',
              padding: '10px 16px',
            }}>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--green)', display: 'inline-block',
                    animation: `pulse 1.2s ${i * 0.2}s infinite`,
                  }} />
                ))}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center', padding: '6px 0' }}>{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick chips */}
      {messages.length <= 2 && (
        <div style={{ padding: '0 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CHIPS.map((c, i) => (
            <button key={i} onClick={() => sendMessage(c)}
              style={{
                background: 'var(--bg2)', color: 'var(--text2)',
                border: '1px solid var(--border)', borderRadius: 16,
                padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}>{c}</button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '10px 14px',
        background: 'var(--bg2)', flexShrink: 0,
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={listening ? '🎤 Listening…' : 'Ask anything… (Enter to send, Shift+Enter for newline)'}
          rows={1}
          style={{
            flex: 1, background: 'var(--bg)', border: `1px solid ${listening ? 'var(--green)' : 'var(--border2)'}`,
            borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
            fontFamily: 'var(--sans)', fontSize: 13, resize: 'none',
            lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
            transition: 'border-color 0.2s',
          }}
        />

        {/* Mic button */}
        {hasSpeech && (
          <button
            onClick={listening ? stopListening : startListening}
            disabled={loading}
            title={listening ? 'Stop listening' : 'Click to speak'}
            style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: listening ? 'rgba(239,68,68,0.2)' : 'var(--bg)',
              border: `2px solid ${listening ? 'var(--red)' : 'var(--border)'}`,
              color: listening ? 'var(--red)' : 'var(--text3)',
              fontSize: 16, cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: listening ? 'pulse 1s infinite' : 'none',
              transition: 'all 0.2s',
            }}>
            {listening ? '⏹' : '🎤'}
          </button>
        )}

        {/* Send button */}
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: (!loading && input.trim()) ? 'rgba(34,197,94,0.2)' : 'var(--bg)',
            border: `2px solid ${(!loading && input.trim()) ? 'var(--green)' : 'var(--border)'}`,
            color: (!loading && input.trim()) ? 'var(--green)' : 'var(--text3)',
            fontSize: 16, cursor: (loading || !input.trim()) ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}>↑</button>
      </div>
    </div>
  )
}
