// created_by:pushkar | helped_by:claude | parth-host-defender
import { useState } from 'react'

const BASE = window.__PARTH_BASE__ || '/api'

export function ScreenCapture() {
  const [image, setImage]       = useState(null)   // base64 string
  const [timestamp, setTimestamp] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [zoom, setZoom]         = useState(false)

  const capture = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${BASE}/screen/capture`, { method: 'POST' })
      const d = await r.json()
      if (!d.success) {
        setError(d.error + (d.hint ? `\n${d.hint}` : ''))
      } else {
        setImage(`data:image/${d.format};base64,${d.image}`)
        setTimestamp(d.timestamp)
      }
    } catch (e) {
      setError(`Failed to reach backend: ${e.message}`)
    }
    setLoading(false)
  }

  const download = () => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image
    a.download = `parth-screenshot-${Date.now()}.png`
    a.click()
  }

  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      // On mobile this lives inside a scroll container — don't use fixed vh height
      minHeight: 400,
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0,
      }}>
        <div>
          <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
            Screen Capture
          </div>
          <div style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)', marginTop: 2, letterSpacing: '.08em' }}>
            ON-DEMAND · SINGLE FRAME · LOCAL ONLY
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {image && (
            <>
              <button onClick={() => setZoom(z => !z)} style={{
                background: 'transparent', color: 'var(--text3)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '5px 12px', fontSize: 11, cursor: 'pointer',
              }}>{zoom ? '⊟ Fit' : '⊞ Zoom'}</button>
              <button onClick={download} style={{
                background: 'rgba(126,184,232,.1)', color: 'var(--blue)',
                border: '1px solid rgba(126,184,232,.25)', borderRadius: 4,
                padding: '5px 12px', fontSize: 11, cursor: 'pointer',
              }}>↓ Save</button>
            </>
          )}
          <button
            onClick={capture}
            disabled={loading}
            style={{
              background: loading ? 'transparent' : 'rgba(232,169,60,.12)',
              color: loading ? 'var(--text3)' : 'var(--gold)',
              border: `1px solid ${loading ? 'var(--border)' : 'rgba(232,169,60,.3)'}`,
              borderRadius: 4, padding: '5px 16px', fontSize: 12,
              fontFamily: 'var(--mono)', letterSpacing: '.06em', cursor: loading ? 'default' : 'pointer',
              transition: 'all .2s',
            }}>
            {loading ? '· · ·' : '⊙ Capture'}
          </button>
        </div>
      </div>

      {/* Notice banner */}
      <div style={{
        padding: '7px 18px', background: 'rgba(232,169,60,.05)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color: 'var(--gold)', fontSize: 11 }}>⚠</span>
        <span style={{ color: 'var(--text3)', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.04em' }}>
          A desktop notification is sent to the monitored machine every time a screenshot is taken.
        </span>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: image ? 'flex-start' : 'center' }}>

        {/* Empty state */}
        {!image && !error && !loading && (
          <div style={{ textAlign: 'center', maxWidth: 340 }}>
            {/* Geometric placeholder */}
            <div style={{
              width: 120, height: 80, margin: '0 auto 24px',
              border: '1px solid var(--border2)', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', background: 'var(--bg2)',
            }}>
              <div style={{ width: 40, height: 40, border: '1px solid var(--border2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border2)' }}/>
              </div>
              {/* Screen corners */}
              {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((s,i)=>(
                <div key={i} style={{ position:'absolute', width:8, height:8, ...s, borderTop: (s.top===0)?'2px solid var(--gold)':undefined, borderBottom: (s.bottom===0)?'2px solid var(--gold)':undefined, borderLeft: (s.left===0)?'2px solid var(--gold)':undefined, borderRight: (s.right===0)?'2px solid var(--gold)':undefined }}/>
              ))}
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 8 }}>No screenshot yet</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, lineHeight: 1.6 }}>
              Click <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)' }}>⊙ Capture</span> to take a one-time screenshot of the monitored machine's screen.
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--gold)', fontSize: 13, fontFamily: 'var(--mono)', marginBottom: 8, letterSpacing: '.08em' }}>Capturing screen…</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: `pulse 1.2s ${i * 0.2}s infinite` }}/>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(224,80,80,.08)', border: '1px solid rgba(224,80,80,.25)',
            borderRadius: 6, padding: '14px 18px', maxWidth: 480, width: '100%',
          }}>
            <div style={{ color: 'var(--red)', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 6 }}>Capture failed</div>
            <pre style={{ color: 'var(--text2)', fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{error}</pre>
            <div style={{ marginTop: 10, color: 'var(--text3)', fontSize: 11 }}>
              Install mss on the backend machine:
              <code style={{ color: 'var(--gold)', marginLeft: 6, fontFamily: 'var(--mono)' }}>pip install mss</code>
            </div>
          </div>
        )}

        {/* Screenshot */}
        {image && !loading && (
          <div style={{ width: '100%' }}>
            {/* Timestamp */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '.08em' }}>
                CAPTURED AT {timestamp ? new Date(timestamp).toLocaleString('en-IN') : ''}
              </div>
              <div style={{ color: 'var(--green)', fontSize: 10, fontFamily: 'var(--mono)' }}>● SINGLE FRAME</div>
            </div>

            {/* Image */}
            <div style={{
              border: '1px solid var(--border2)', borderRadius: 4,
              overflow: 'hidden', background: '#000',
              cursor: zoom ? 'zoom-out' : 'zoom-in',
            }} onClick={() => setZoom(z => !z)}>
              <img
                src={image}
                alt="Screenshot"
                style={{
                  width: zoom ? 'auto' : '100%',
                  maxWidth: zoom ? 'none' : '100%',
                  display: 'block',
                  imageRendering: zoom ? 'pixelated' : 'auto',
                }}
              />
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 10, marginTop: 6, textAlign: 'center', fontFamily: 'var(--mono)' }}>
              Click image to {zoom ? 'fit' : 'zoom'} · Use ↓ Save to download
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
