import { useState, useEffect } from 'react'

const BASE = window.__PARTH_BASE__ || '/api'

export function FileEditor({ onClose }) {
  const [filename, setFilename] = useState('notes.txt')
  const [content, setContent]   = useState('')
  const [files, setFiles]       = useState([])
  const [status, setStatus]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [view, setView]         = useState('editor') // 'editor' | 'files'

  useEffect(() => { loadFiles() }, [])

  const loadFiles = async () => {
    try {
      const r = await fetch(`${BASE}/files/list`)
      const d = await r.json()
      setFiles(d.files || [])
    } catch {}
  }

  const save = async () => {
    if (!filename.trim() || !content.trim()) { setStatus('Filename and content required'); return }
    setLoading(true); setStatus('')
    try {
      const r = await fetch(`${BASE}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: filename.trim(), content }),
      })
      const d = await r.json()
      if (d.status === 'ok') {
        setStatus(`✓ Saved to ${d.path} (${d.size} bytes)`)
        loadFiles()
      } else {
        setStatus(`Error: ${d.detail || 'unknown'}`)
      }
    } catch (e) { setStatus(`Error: ${e.message}`) }
    setLoading(false)
  }

  const openFile = async (name) => {
    try {
      const r = await fetch(`${BASE}/files/read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name }),
      })
      const d = await r.json()
      setFilename(name); setContent(d.content || '')
      setView('editor'); setStatus(`Opened: ${name}`)
    } catch {}
  }

  const del = async (name) => {
    if (!confirm(`Delete ${name}?`)) return
    await fetch(`${BASE}/files/${encodeURIComponent(name)}`, { method: 'DELETE' })
    loadFiles()
  }

  const ALLOWED = '.txt .md .py .js .ts .html .css .json .yaml .sh .csv'

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
        <span style={{ color: 'var(--green)', fontSize: 13 }}>📄</span>
        <span style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'var(--mono)', flex: 1 }}>File Editor — saves to ~/Documents/PARTH/</span>
        {['editor','files'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            background: view === v ? 'var(--bg)' : 'transparent',
            color: view === v ? 'var(--text)' : 'var(--text3)',
            border: `1px solid ${view === v ? 'var(--border2)' : 'transparent'}`,
            borderRadius: 4, padding: '2px 10px', fontSize: 11, cursor: 'pointer',
          }}>{v === 'editor' ? '✏ Edit' : `📁 Files (${files.length})`}</button>
        ))}
        {onClose && <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text3)', border: 'none', fontSize: 16, cursor: 'pointer' }}>×</button>}
      </div>

      {view === 'editor' && (
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={filename} onChange={e => setFilename(e.target.value)}
              placeholder="filename.txt"
              style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12 }} />
            <button onClick={save} disabled={loading} style={{
              background: 'rgba(34,197,94,.2)', color: 'var(--green)',
              border: '1px solid rgba(34,197,94,.3)', borderRadius: 4,
              padding: '5px 16px', fontSize: 12, fontFamily: 'var(--mono)', cursor: 'pointer',
            }}>{loading ? 'Saving…' : '💾 Save'}</button>
          </div>

          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="Type your content here…"
            rows={10}
            style={{
              width: '100%', background: 'var(--bg)', border: '1px solid var(--border2)',
              borderRadius: 4, padding: '8px 10px', color: 'var(--text)',
              fontFamily: 'var(--mono)', fontSize: 12, resize: 'vertical',
              lineHeight: 1.6, boxSizing: 'border-box',
            }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {status && <span style={{ color: status.startsWith('✓') ? 'var(--green)' : 'var(--red)', fontSize: 11, fontFamily: 'var(--mono)' }}>{status}</span>}
            <span style={{ color: 'var(--text3)', fontSize: 10, marginLeft: 'auto', fontFamily: 'var(--mono)' }}>Allowed: {ALLOWED}</span>
          </div>
        </div>
      )}

      {view === 'files' && (
        <div style={{ padding: 10 }}>
          {files.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>No files yet. Create one in the editor.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 4, padding: '6px 10px' }}>
                <span style={{ color: 'var(--text)', fontSize: 12, fontFamily: 'var(--mono)', flex: 1 }}>{f.name}</span>
                <span style={{ color: 'var(--text3)', fontSize: 10 }}>{(f.size / 1024).toFixed(1)}KB</span>
                <button onClick={() => openFile(f.name)} style={{ background: 'transparent', color: 'var(--blue)', border: 'none', fontSize: 11, cursor: 'pointer' }}>open</button>
                <button onClick={() => del(f.name)} style={{ background: 'transparent', color: 'var(--red)', border: 'none', fontSize: 11, cursor: 'pointer' }}>del</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
