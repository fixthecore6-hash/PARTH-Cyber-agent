/**
 * PARTH — Model & Theme Settings
 * created_by:pushkar | helped_by:claude | parth-host-defender
 */

import { useState, useEffect, useCallback } from 'react'

const BASE = window.__PARTH_BASE__ || '/api'

const KNOWN_MODELS = [
  { id: 'mistral',          ram: '~6 GB',   note: 'Well-rounded default'         },
  { id: 'llama3.1',         ram: '~6 GB',   note: 'Strong reasoning'             },
  { id: 'llama3',           ram: '~6 GB',   note: 'Meta LLaMA 3'                 },
  { id: 'phi3',             ram: '~4 GB',   note: 'Good for lighter machines'     },
  { id: 'phi3:mini',        ram: '~2.5 GB', note: 'Minimal systems'              },
  { id: 'gemma2',           ram: '~6 GB',   note: 'Clean structured output'      },
  { id: 'deepseek-r1',      ram: '~8 GB',   note: 'Best for complex threats'     },
  { id: 'qwen2.5',          ram: '~5 GB',   note: 'Multilingual, strong'         },
  { id: 'qwen2.5:0.5b',     ram: '~1 GB',   note: 'Ultra-light, fast'            },
  { id: 'codellama',        ram: '~6 GB',   note: 'Great for log/code analysis'  },
  { id: 'tinyllama',        ram: '~1.5 GB', note: 'Last resort — limited'        },
]

export function ModelSettings() {
  const [current, setCurrent]       = useState(null)
  const [pulled, setPulled]         = useState([])
  const [custom, setCustom]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState({ text: '', ok: true })
  const [loading, setLoading]       = useState(true)

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg({ text: '', ok: true }), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cur, avail] = await Promise.all([
        fetch(`${BASE}/model/current`).then(r => r.json()).catch(() => ({})),
        fetch(`${BASE}/model/available`).then(r => r.json()).catch(() => ({ models: [] })),
      ])
      setCurrent(cur.model || null)
      setPulled(avail.models || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const applyModel = async (modelId) => {
    if (!modelId?.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`${BASE}/model/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Failed')
      setCurrent(modelId.trim())
      setCustom('')
      flash(`✓ Model set to ${modelId.trim()} — saved to .env`)
    } catch (e) {
      flash(e.message, false)
    }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)', padding: '20px 0' }}>
      Loading model info…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Current model */}
      <div style={{ background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(0,229,160,.1)', border: '1px solid rgba(0,229,160,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>Active AI Model</div>
          <div style={{ color: current ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700 }}>
            {current || 'NOT SET'}
          </div>
        </div>
        {!current && (
          <div style={{ fontSize: 10, color: 'var(--red)', background: 'rgba(255,56,96,.1)', border: '1px solid rgba(255,56,96,.25)', borderRadius: 6, padding: '4px 8px' }}>
            Set a model below
          </div>
        )}
      </div>

      {/* Flash */}
      {msg.text && (
        <div style={{ padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, animation: 'fadeUp .2s ease',
          background: msg.ok ? 'rgba(0,229,160,.1)' : 'rgba(255,56,96,.1)',
          border: `1px solid ${msg.ok ? 'rgba(0,229,160,.3)' : 'rgba(255,56,96,.3)'}`,
          color: msg.ok ? 'var(--green)' : 'var(--red)',
        }}>{msg.text}</div>
      )}

      {/* Pulled models (from Ollama) */}
      {pulled.length > 0 && (
        <div>
          <div style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
            Installed on this machine ({pulled.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pulled.map(m => {
              const isActive = m === current
              return (
                <div key={m} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: isActive ? 'rgba(0,229,160,.08)' : 'var(--bg4)',
                  border: `1px solid ${isActive ? 'rgba(0,229,160,.35)' : 'var(--border)'}`,
                  transition: 'all .2s',
                }} onClick={() => !isActive && applyModel(m)}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isActive ? 'var(--green)' : 'var(--border2)', boxShadow: isActive ? '0 0 8px rgba(0,229,160,.5)' : 'none' }}/>
                  <span style={{ flex: 1, color: isActive ? 'var(--green)' : 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12 }}>{m}</span>
                  {isActive
                    ? <span style={{ fontSize: 10, color: 'var(--green)', letterSpacing: '.06em' }}>ACTIVE</span>
                    : <button disabled={saving} onClick={e => { e.stopPropagation(); applyModel(m) }}
                        style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(0,229,160,.1)', color: 'var(--green)', border: '1px solid rgba(0,229,160,.25)', cursor: 'pointer' }}>
                        Use
                      </button>
                  }
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Known model library */}
      <div>
        <div style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          Model Library — click to set (pulls on first use)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {KNOWN_MODELS.map(m => {
            const isActive  = m.id === current
            const installed = pulled.includes(m.id)
            return (
              <div key={m.id} onClick={() => applyModel(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                  background: isActive ? 'rgba(0,229,160,.08)' : 'var(--bg4)',
                  border: `1px solid ${isActive ? 'rgba(0,229,160,.3)' : 'var(--border)'}`,
                  transition: 'all .15s',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <code style={{ flex: 1, color: isActive ? 'var(--green)' : 'var(--text)', fontSize: 12, fontFamily: 'var(--mono)' }}>{m.id}</code>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>{m.ram}</span>
                <span style={{ color: 'var(--text3)', fontSize: 11, flex: 1, textAlign: 'right' }}>{m.note}</span>
                {installed && <span style={{ fontSize: 9, color: 'var(--green)', background: 'rgba(0,229,160,.1)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 4, padding: '2px 6px', letterSpacing: '.06em' }}>INSTALLED</span>}
                {isActive  && <span style={{ fontSize: 9, color: 'var(--amber)', background: 'var(--amber-dim)', border: '1px solid rgba(240,184,64,.3)', borderRadius: 4, padding: '2px 6px', letterSpacing: '.06em' }}>ACTIVE</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Custom model input */}
      <div style={{ background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px' }}>
        <div style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Custom / Unlisted Model</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyModel(custom)}
            placeholder="e.g. llama3.2:3b or mistral:latest"
            style={{
              flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)',
              borderRadius: 7, padding: '9px 12px', color: 'var(--text)',
              fontFamily: 'var(--mono)', fontSize: 12,
            }}
          />
          <button
            onClick={() => applyModel(custom)}
            disabled={!custom.trim() || saving}
            style={{
              padding: '9px 16px', borderRadius: 7, fontWeight: 600, fontSize: 12,
              background: custom.trim() ? 'rgba(0,229,160,.15)' : 'var(--bg)',
              color: custom.trim() ? 'var(--green)' : 'var(--text3)',
              border: `1px solid ${custom.trim() ? 'rgba(0,229,160,.3)' : 'var(--border)'}`,
              cursor: custom.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? '…' : 'Apply'}
          </button>
        </div>
        <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8 }}>
          Any model name from <code style={{ color: 'var(--green)' }}>ollama list</code> works. Saved to <code style={{ color: 'var(--green)' }}>.env</code> and persists across restarts.
        </div>
      </div>

    </div>
  )
}
