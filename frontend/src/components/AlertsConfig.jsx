import { useState, useEffect } from 'react'
import { StartupSettings } from './StartupSettings'

const BASE = window.__PARTH_BASE__ || '/api'

export function AlertsConfig() {
  const [config, setConfig] = useState(null)
  const [netInfo, setNetInfo] = useState(null)

  useEffect(() => {
    fetch(`${BASE}/alerts/config`).then(r => r.json()).then(setConfig).catch(() => {})
    fetch(`${BASE}/network/info`).then(r => r.json()).then(setNetInfo).catch(() => {})
  }, [])

  const envVars = [
    { key: 'PARTH_TELEGRAM_TOKEN', label: 'Telegram Bot Token', active: config?.telegram },
    { key: 'PARTH_TELEGRAM_CHAT_ID', label: 'Telegram Chat ID', active: config?.telegram },
    { key: 'PARTH_DISCORD_WEBHOOK', label: 'Discord Webhook URL', active: config?.discord },
    { key: 'PARTH_WEBHOOK_URL', label: 'Generic Webhook URL', active: config?.webhook },
    { key: 'PARTH_ALLOW_EXECUTE', label: 'Allow Action Execution (true/false)', active: config?.execute_actions === 'true' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>

      {/* ── STARTUP SETTINGS (New section) ── */}
      <div>
        <div style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
          <span>Startup Settings</span>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
        </div>
        <StartupSettings />
      </div>

      {/* ── DIVIDER ── */}
      <div style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.15em', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
        <span>Network & Alerts</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
      </div>

      {/* ── Network Info ── */}
      {netInfo && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--green)', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ color: 'var(--green)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>📱 Access from Phone / Any Device on Same WiFi</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <code style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 14px', fontSize: 14, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{netInfo.dashboard_url}</code>
            <button onClick={() => navigator.clipboard.writeText(netInfo.dashboard_url)} style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Copy</button>
          </div>
          <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8 }}>If unreachable: <code style={{ color: 'var(--amber)' }}>sudo ufw allow 5173 && sudo ufw allow 8000</code></div>
        </div>
      )}

      {/* ── Alert Destinations ── */}
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px' }}>
        <div style={{ color: 'var(--text2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Alert Destinations
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
          Add these to your <code style={{ color: 'var(--green)' }}>.env</code> file in the project root, then restart PARTH:
        </div>
        {envVars.map(v => (
          <div key={v.key} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 4, marginBottom: 4,
            background: 'var(--bg2)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: v.active ? 'var(--green)' : 'var(--border2)',
              flexShrink: 0,
            }} />
            <code style={{ color: 'var(--amber)', fontSize: 12 }}>{v.key}</code>
            <span style={{ color: 'var(--text3)', fontSize: 11 }}>— {v.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: v.active ? 'var(--green)' : 'var(--text3)' }}>
              {v.active ? '✓ configured' : 'not set'}
            </span>
          </div>
        ))}
      </div>

      {/* ── Export Events ── */}
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px' }}>
        <div style={{ color: 'var(--text2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Export Events
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={`${BASE}/events/export/csv`} download style={{
            background: 'var(--green-dim)', color: 'var(--green)',
            border: '1px solid var(--green-dim)', borderRadius: 4,
            padding: '8px 20px', fontSize: 12, fontFamily: 'var(--mono)',
          }}>↓ Export CSV</a>
          <a href={`${BASE}/events/export/json`} download style={{
            background: 'var(--blue-dim)', color: 'var(--blue)',
            border: '1px solid var(--blue-dim)', borderRadius: 4,
            padding: '8px 20px', fontSize: 12, fontFamily: 'var(--mono)',
          }}>↓ Export JSON</a>
        </div>
      </div>
    </div>
  )
}
