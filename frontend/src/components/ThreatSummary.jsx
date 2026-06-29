import { useState } from 'react'
import { fetchThreatSummary } from '../hooks/useApi'

export function ThreatSummary() {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    setSummary('')
    try {
      const d = await fetchThreatSummary()
      setSummary(d.summary || 'No data available.')
    } catch {
      setSummary('Failed to reach backend.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--text2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          AI Threat Summary
        </span>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            background: loading ? 'var(--bg2)' : 'var(--green-dim)',
            color: loading ? 'var(--text3)' : 'var(--green)',
            border: '1px solid',
            borderColor: loading ? 'var(--border)' : 'var(--green-dim)',
            borderRadius: 4,
            padding: '4px 12px',
            fontSize: 12,
            fontFamily: 'var(--mono)',
          }}
        >
          {loading ? 'Analyzing...' : '⚡ Generate'}
        </button>
      </div>

      {loading && (
        <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
          Querying local AI model......
        </div>
      )}

      {summary && !loading && (
        <div style={{
          color: 'var(--text)',
          fontSize: 13,
          lineHeight: 1.7,
          borderLeft: '3px solid var(--green)',
          paddingLeft: 12,
          whiteSpace: 'pre-wrap',
        }}>
          {summary}
        </div>
      )}

      {!summary && !loading && (
        <div style={{ color: 'var(--text3)', fontSize: 12 }}>
          Click Generate to get an AI analysis of recent threats using your local Ollama model.
        </div>
      )}
    </div>
  )
}
