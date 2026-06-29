import { useState } from 'react'
import { SeverityBadge } from './SeverityBadge'

const SKIP_TYPES = ['system_metrics', 'listening_ports_snapshot', 'ping']
const BASE = window.__PARTH_BASE__ || '/api'

export function EventFeed({ events }) {
  const filtered = events.filter(e => !SKIP_TYPES.includes(e.event_type))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {filtered.length === 0 && (
        <div style={{ color: 'var(--text3)', padding: '24px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 12 }}>
          — no events yet —
        </div>
      )}
      {filtered.map((ev, i) => (
        <EventRow key={ev.id || i} event={ev} />
      ))}
    </div>
  )
}

function EventRow({ event }) {
  const [expanded, setExpanded] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  const ts = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString('en-IN', { hour12: false })
    : ''
  const sev = (event.severity || 'info').toLowerCase()
  const isBad = ['critical', 'high'].includes(sev)
  const isAiResult = event.event_type === 'ai_analysis_result'

  const askAI = async (e) => {
    e.stopPropagation()
    setAiLoading(true)
    setExpanded(true)
    try {
      const r = await fetch(`${BASE}/ai/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: event.event_type,
          severity: event.severity,
          source: event.source,
          data: event.data || {},
        }),
      })
      const d = await r.json()
      setAiResult(d)
    } catch {
      setAiResult({ explanation: 'Failed to reach AI engine.' })
    }
    setAiLoading(false)
  }

  return (
    <div style={{
      borderRadius: 4,
      background: isBad ? (sev === 'critical' ? 'rgba(244,63,94,0.05)' : 'rgba(251,146,60,0.04)') : 'transparent',
      borderLeft: isBad ? `2px solid ${sev === 'critical' ? 'var(--red)' : '#fb923c'}` : '2px solid transparent',
      animation: 'slideIn 0.2s ease',
      fontSize: 12,
    }}>
      <div
        onClick={() => setExpanded(x => !x)}
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 90px 180px 1fr auto',
          gap: 8, alignItems: 'start',
          padding: '6px 10px', cursor: 'pointer',
        }}
      >
        <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{ts}</span>
        <SeverityBadge severity={event.severity} />
        <span style={{ color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }}>{event.event_type}</span>
        <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
          {event.source && <span style={{ color: 'var(--text3)', marginRight: 4 }}>[{event.source}]</span>}
          {summarizeData(event)}
        </span>
        {!isAiResult && (
          <button onClick={askAI} disabled={aiLoading} title="Ask AI to explain"
            style={{
              background: 'var(--green-dim)', color: 'var(--green)',
              border: '1px solid var(--green-dim)', borderRadius: 3,
              padding: '1px 7px', fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
            }}
          >{aiLoading ? '...' : '⚡ AI'}</button>
        )}
      </div>

      {expanded && (
        <div style={{
          margin: '0 10px 8px 10px', background: 'var(--bg2)',
          borderRadius: 4, padding: '10px 12px',
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)',
        }}>
          <div style={{ marginBottom: aiResult ? 10 : 0 }}>
            <span style={{ color: 'var(--text3)' }}>RAW DATA: </span>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text)', fontSize: 10 }}>
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>

          {aiResult && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
              <div style={{ color: 'var(--green)', marginBottom: 6 }}>⚡ AI ANALYSIS</div>
              {aiResult.explanation && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--text3)' }}>Explanation: </span>
                  <span style={{ color: 'var(--text)' }}>{aiResult.explanation}</span>
                </div>
              )}
              {aiResult.threat_category && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--text3)' }}>Category: </span>
                  <span style={{ color: 'var(--amber)' }}>{aiResult.threat_category}</span>
                  <span style={{ color: 'var(--text3)', marginLeft: 8 }}>Confidence: </span>
                  <span style={{ color: 'var(--blue)' }}>{aiResult.confidence}</span>
                  <span style={{ color: 'var(--text3)', marginLeft: 8 }}>FP: </span>
                  <span style={{ color: 'var(--text)' }}>{aiResult.false_positive_likelihood}</span>
                </div>
              )}
              {aiResult.recommended_actions?.length > 0 && (
                <div>
                  <div style={{ color: 'var(--text3)', marginBottom: 4 }}>Actions:</div>
                  {aiResult.recommended_actions.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ color: 'var(--green)' }}>▸</span>
                      <code style={{ color: 'var(--text)', background: 'var(--bg)', padding: '1px 4px', borderRadius: 2 }}>{a}</code>
                      <button onClick={() => navigator.clipboard.writeText(a)}
                        style={{ background: 'transparent', color: 'var(--text3)', border: 'none', fontSize: 10, cursor: 'pointer' }}
                        title="Copy">⧉</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function summarizeData(event) {
  const d = event.data || {}
  if (event.event_type === 'suspicious_process') return `${d.name} (pid:${d.pid}) — ${d.matched_pattern}`
  if (event.event_type === 'file_integrity_violation') return `${d.path}`
  if (event.event_type === 'brute_force_detected') return `${d.attempt_count} failed logins from ${d.source_ip}`
  if (event.event_type === 'suspicious_connection') return `${d.process} → ${d.remote_ip}:${d.remote_port}`
  if (event.event_type === 'privilege_escalation') return `${d.name} (pid:${d.pid}) running as UID 0`
  if (event.event_type === 'high_cpu_spike') return `CPU at ${d.cpu_percent}%`
  if (event.event_type === 'high_gpu_utilization') return `GPU ${d.gpu_name} at ${d.util_percent}%`
  if (event.event_type === 'usb_device_connected') return `USB connected: ${d.product_name || d.vendor_id}`
  if (event.event_type === 'usb_device_removed') return `USB removed: ${d.product_name || d.vendor_id}`
  if (event.event_type === 'hidden_process') return `Hidden PID ${d.pid}: ${d.cmdline?.slice(0, 80)}`
  if (event.event_type === 'ld_preload_set') return `ld.so.preload: ${d.content?.slice(0, 80)}`
  if (event.event_type === 'new_kernel_module') return `Kernel module loaded: ${d.module}`
  if (event.event_type === 'new_suid_binary') return `New SUID: ${d.path}`
  if (event.event_type === 'dga_domain') return `DGA: ${d.domain} (entropy: ${d.entropy})`
  if (event.event_type === 'dns_beacon') return `Beacon: ${d.domain} queried ${d.query_count}x`
  if (event.event_type === 'ai_analysis_result') return `AI: ${d.explanation?.slice(0, 120)}`
  if (d.raw_line) return d.raw_line.slice(0, 120)
  return JSON.stringify(d).slice(0, 120)
}
