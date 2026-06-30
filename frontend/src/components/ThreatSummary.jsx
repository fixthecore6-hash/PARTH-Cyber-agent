// created_by:pushkar | helped_by:claude | parth-host-defender
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
      borderRadius: 6,
      padding: '16px 18px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* top accent */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, var(--gold), var(--saffron), transparent)', opacity:.6 }}/>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <span style={{ color:'var(--text2)', fontSize:11, textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)' }}>
          ◈ AI Threat Summary
        </span>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            background: loading ? 'transparent' : 'rgba(232,169,60,.12)',
            color: loading ? 'var(--text3)' : 'var(--gold)',
            border: `1px solid ${loading ? 'var(--border)' : 'rgba(232,169,60,.3)'}`,
            borderRadius: 4,
            padding: '4px 14px',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            letterSpacing: '.06em',
            transition: 'all .2s',
          }}
        >
          {loading ? '· · ·' : '⚡ Generate'}
        </button>
      </div>

      {loading && (
        <div style={{ color:'var(--text3)', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.08em' }}>
          Querying local AI model...
        </div>
      )}

      {summary && !loading && (
        <div style={{
          color: 'var(--text)',
          fontSize: 13,
          lineHeight: 1.75,
          borderLeft: '2px solid var(--gold)',
          paddingLeft: 14,
          whiteSpace: 'pre-wrap',
        }}>
          {summary}
        </div>
      )}

      {!summary && !loading && (
        <div style={{ color:'var(--text3)', fontSize:12, lineHeight:1.6 }}>
          Click Generate to get an AI analysis of recent threats using your local Ollama model.
        </div>
      )}
    </div>
  )
}
