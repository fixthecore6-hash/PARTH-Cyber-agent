/**
 * PARTH — Startup Settings Component
 * created_by:pushkar | helped_by:claude | parth-host-defender
 * PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
 */

import { useState, useEffect, useCallback } from 'react'

const BASE = window.__PARTH_BASE__ || '/api'

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return 'Never'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch { return iso }
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled, size = 'md' }) {
  const w = size === 'sm' ? 36 : 44
  const h = size === 'sm' ? 20 : 24
  const r = size === 'sm' ? 14 : 18
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      role="switch" aria-checked={checked}
      style={{
        width: w, height: h, borderRadius: h / 2, flexShrink: 0,
        background: checked ? 'var(--green)' : 'var(--border2)',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .25s', opacity: disabled ? 0.45 : 1,
        boxShadow: checked ? '0 0 12px rgba(0,229,160,.45)' : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: (h - r) / 2,
        left: checked ? w - r - (h - r) / 2 : (h - r) / 2,
        width: r, height: r, borderRadius: '50%',
        background: '#fff', transition: 'left .25s',
        boxShadow: '0 1px 4px rgba(0,0,0,.35)',
      }}/>
    </div>
  )
}

// ── Info Row ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text3)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color: color || 'var(--text)', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmModal({ open, title, message, onConfirm, onCancel, danger }) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(6,8,16,.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border2)',
        borderRadius: 14, padding: '28px 28px 22px', maxWidth: 420, width: '90%',
        boxShadow: '0 24px 60px rgba(0,0,0,.7)',
        animation: 'fadeUp .25s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: danger ? 'rgba(255,56,96,.15)' : 'rgba(0,229,160,.12)',
            border: `1px solid ${danger ? 'rgba(255,56,96,.4)' : 'rgba(0,229,160,.3)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            {danger ? '⚠' : '🔒'}
          </div>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15 }}>{title}</div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>System Startup Configuration</div>
          </div>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: danger ? 'var(--red)' : 'var(--green)',
            color: danger ? '#fff' : '#000', border: 'none', cursor: 'pointer',
          }}>
            {danger ? 'Disable Startup' : 'Confirm & Apply'}
          </button>
          <button onClick={onCancel} style={{
            padding: '10px 18px', borderRadius: 8, fontSize: 13,
            background: 'var(--bg4)', color: 'var(--text2)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ enabled }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 10,
      fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '.08em',
      background: enabled ? 'rgba(0,229,160,.12)' : 'rgba(100,116,139,.12)',
      color: enabled ? 'var(--green)' : 'var(--text3)',
      border: `1px solid ${enabled ? 'rgba(0,229,160,.3)' : 'rgba(100,116,139,.25)'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: enabled ? 'var(--green)' : 'var(--text3)',
        animation: enabled ? 'pulse 2s infinite' : 'none',
      }}/>
      {enabled ? 'ENABLED' : 'DISABLED'}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function StartupSettings() {
  const [status, setStatus]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  // Local pending settings (before apply)
  const [pendingMethod,    setPendingMethod]    = useState('registry')
  const [pendingDelay,     setPendingDelay]     = useState(0)
  const [pendingMinimized, setPendingMinimized] = useState(false)

  // Confirm modal state
  const [confirm, setConfirm] = useState({ open: false, action: null, danger: false })

  // ── Fetch status ──────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/startup/status`)
      if (!r.ok) throw new Error('Backend unreachable')
      const d = await r.json()
      setStatus(d)
      setPendingMethod(d.startup_method || 'registry')
      setPendingDelay(d.startup_delay || 0)
      setPendingMinimized(d.launch_minimized || false)
      setError('')
    } catch (e) {
      setError('Cannot reach backend. Make sure PARTH is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // ── Flash message helpers ─────────────────────────────────────────────────
  const flash = (msg, isErr = false) => {
    if (isErr) { setError(msg); setSuccess('') }
    else { setSuccess(msg); setError('') }
    setTimeout(() => { setError(''); setSuccess('') }, 4000)
  }

  // ── Toggle handler (asks for confirmation) ────────────────────────────────
  const handleToggle = (wantEnabled) => {
    if (wantEnabled) {
      setConfirm({
        open: true,
        danger: false,
        action: 'enable',
        title: 'Enable Auto-Start',
        message: `PARTH will be added to your Windows Startup entries using the ${
          pendingMethod === 'registry' ? 'Registry Run key' : 'Startup Folder'
        }. It will launch automatically on every login.`,
      })
    } else {
      setConfirm({
        open: true,
        danger: true,
        action: 'disable',
        title: 'Disable Auto-Start',
        message: 'PARTH will be removed from Windows Startup. It will no longer launch automatically after reboot.',
      })
    }
  }

  // ── Confirm action ────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setConfirm(c => ({ ...c, open: false }))
    setSaving(true)
    try {
      if (confirm.action === 'enable') {
        const r = await fetch(`${BASE}/startup/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: pendingMethod,
            delay: pendingDelay,
            minimized: pendingMinimized,
          }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.detail || 'Enable failed')
        flash('✓ Auto-Start enabled — PARTH will launch on next login')
      } else {
        const r = await fetch(`${BASE}/startup/disable`, { method: 'POST' })
        const d = await r.json()
        if (!r.ok) throw new Error(d.detail || 'Disable failed')
        flash('Auto-Start disabled')
      }
      await fetchStatus()
    } catch (e) {
      flash(e.message || 'Operation failed', true)
    } finally {
      setSaving(false)
    }
  }

  // ── Save sub-settings ──────────────────────────────────────────────────────
  const saveSubSettings = async () => {
    setSaving(true)
    try {
      const r = await fetch(`${BASE}/startup/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          launch_minimized: pendingMinimized,
          startup_delay:    pendingDelay,
          startup_method:   pendingMethod,
        }),
      })
      if (!r.ok) throw new Error('Save failed')
      flash('✓ Settings saved')
      await fetchStatus()
    } catch (e) {
      flash(e.message, true)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived display values ────────────────────────────────────────────────
  const isEnabled     = status?.auto_start || false
  const actualEnabled = status?.actual_enabled || false
  const isWin         = status?.is_windows !== false // treat unknown as windows
  const hasAdmin      = status?.has_admin
  const launchMode    = isEnabled
    ? (status?.launch_minimized ? 'Background (Tray)' : 'Normal Window')
    : '—'
  const methodLabel = {
    registry:        'Windows Registry',
    startup_folder:  'Startup Folder',
    task_scheduler:  'Task Scheduler',
  }[status?.startup_method] || '—'

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
      <span style={{ animation: 'pulse 1.5s infinite' }}>● Loading startup configuration…</span>
    </div>
  )

  return (
    <>
      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        danger={confirm.danger}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(c => ({ ...c, open: false }))}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

        {/* ── Header card ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,229,160,.07), rgba(77,184,255,.04))',
          border: '1px solid rgba(0,229,160,.2)',
          borderRadius: 12, padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(0,229,160,.4),transparent)' }}/>
          <div style={{
            width: 52, height: 52, borderRadius: 13, flexShrink: 0,
            background: 'radial-gradient(circle at 35% 35%, #00e5a0, #003d2a)',
            border: '1px solid rgba(0,229,160,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: '0 0 20px rgba(0,229,160,.25)',
          }}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
              Startup Configuration
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 12, lineHeight: 1.5 }}>
              Control how PARTH launches with Windows. Choose between automatic protection on every login or manual startup only when needed.
            </div>
          </div>
          <StatusBadge enabled={isEnabled} />
        </div>

        {/* ── Admin warning ── */}
        {!hasAdmin && isWin && (
          <div style={{
            background: 'rgba(255,184,48,.08)', border: '1px solid rgba(255,184,48,.3)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Limited Privileges
              </div>
              <div style={{ color: 'var(--text3)', fontSize: 12, lineHeight: 1.5 }}>
                PARTH is running without administrator rights. The <strong style={{ color: 'var(--text2)' }}>Registry Run key</strong> method works without admin and is recommended. Task Scheduler (admin-level) is unavailable.
              </div>
            </div>
          </div>
        )}

        {/* ── Flash messages ── */}
        {(error || success) && (
          <div style={{
            background: error ? 'rgba(255,56,96,.1)' : 'rgba(0,229,160,.1)',
            border: `1px solid ${error ? 'rgba(255,56,96,.3)' : 'rgba(0,229,160,.3)'}`,
            borderRadius: 8, padding: '10px 14px',
            color: error ? 'var(--red)' : 'var(--green)',
            fontSize: 13, fontWeight: 500,
            animation: 'fadeUp .2s ease',
          }}>
            {error || success}
          </div>
        )}

        {/* ── Mode selector ── */}
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg4)' }}>
            <div style={{ color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600 }}>
              Startup Mode
            </div>
          </div>

          {/* Automatic */}
          <div
            onClick={() => !saving && handleToggle(true)}
            style={{
              padding: '16px 18px', borderBottom: '1px solid var(--border)',
              cursor: 'pointer', transition: 'background .2s',
              background: isEnabled ? 'rgba(0,229,160,.04)' : 'transparent',
              display: 'flex', gap: 14, alignItems: 'flex-start',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: isEnabled ? 'rgba(0,229,160,.15)' : 'rgba(100,116,139,.1)',
              border: `1px solid ${isEnabled ? 'rgba(0,229,160,.3)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, transition: 'all .2s',
            }}>🚀</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>
                  Automatic Startup
                </span>
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: 'rgba(0,229,160,.15)', color: 'var(--green)', fontFamily: 'var(--mono)', letterSpacing: '.08em' }}>
                  RECOMMENDED
                </span>
              </div>
              <div style={{ color: 'var(--text3)', fontSize: 12, lineHeight: 1.55 }}>
                Launch PARTH automatically whenever Windows starts. Monitoring begins immediately in the background after login.
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {['Silent background start', 'Immediate monitoring', 'No manual interaction'].map(f => (
                  <span key={f} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--bg4)', color: 'var(--text3)', border: '1px solid var(--border)' }}>✓ {f}</span>
                ))}
              </div>
            </div>
            <div style={{ flexShrink: 0, paddingTop: 2 }}>
              <Toggle checked={isEnabled} onChange={handleToggle} disabled={saving} />
            </div>
          </div>

          {/* Manual */}
          <div
            onClick={() => !saving && isEnabled && handleToggle(false)}
            style={{
              padding: '16px 18px', cursor: isEnabled ? 'pointer' : 'default',
              background: !isEnabled ? 'rgba(100,116,139,.04)' : 'transparent',
              display: 'flex', gap: 14, alignItems: 'flex-start',
              transition: 'background .2s',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: !isEnabled ? 'rgba(100,116,139,.15)' : 'rgba(100,116,139,.06)',
              border: `1px solid ${!isEnabled ? 'rgba(100,116,139,.3)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, transition: 'all .2s',
            }}>🖱</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Manual Startup</div>
              <div style={{ color: 'var(--text3)', fontSize: 12, lineHeight: 1.55 }}>
                PARTH only runs when you launch it manually. No startup entry is created. Suitable for occasional use.
              </div>
            </div>
            <div style={{ flexShrink: 0, paddingTop: 2 }}>
              <Toggle checked={!isEnabled} onChange={() => isEnabled && handleToggle(false)} disabled={saving} />
            </div>
          </div>
        </div>

        {/* ── Sub-settings (always visible, applied when enabled) ── */}
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600 }}>
              Launch Options
            </div>
            <span style={{ color: 'var(--text3)', fontSize: 10 }}>Applied on next enable / update</span>
          </div>

          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Startup method */}
            <div>
              <div style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Startup Method</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { id: 'registry',       label: 'Registry Run Key',  icon: '🔑', desc: 'No admin needed' },
                  { id: 'startup_folder', label: 'Startup Folder',    icon: '📁', desc: 'Visible in shell:startup' },
                ].map(m => (
                  <button key={m.id} onClick={() => setPendingMethod(m.id)} style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: pendingMethod === m.id ? 'rgba(0,229,160,.1)' : 'var(--bg4)',
                    border: `1px solid ${pendingMethod === m.id ? 'rgba(0,229,160,.4)' : 'var(--border)'}`,
                    transition: 'all .2s',
                  }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{m.icon}</div>
                    <div style={{ color: pendingMethod === m.id ? 'var(--green)' : 'var(--text)', fontSize: 12, fontWeight: 600 }}>{m.label}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 10, marginTop: 2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Launch minimized */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg4)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15 }}>🔕</span>
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>Launch minimized to system tray</span>
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11, paddingLeft: 23 }}>
                  PARTH starts quietly in the background without opening the main dashboard
                </div>
              </div>
              <Toggle size="sm" checked={pendingMinimized} onChange={setPendingMinimized} />
            </div>

            {/* Startup delay */}
            <div style={{ padding: '12px 14px', background: 'var(--bg4)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 15 }}>⏱</span>
                <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>Delay startup after login</span>
              </div>
              <div style={{ color: 'var(--text3)', fontSize: 11, paddingLeft: 23, marginBottom: 12 }}>
                Reduces system load immediately after boot. PARTH waits before launching.
              </div>
              <div style={{ display: 'flex', gap: 8, paddingLeft: 23 }}>
                {[
                  { v: 0,  label: 'No delay',  sub: 'instant' },
                  { v: 15, label: '15 seconds', sub: 'light boot' },
                  { v: 30, label: '30 seconds', sub: 'recommended' },
                ].map(d => (
                  <button key={d.v} onClick={() => setPendingDelay(d.v)} style={{
                    flex: 1, padding: '8px 6px', borderRadius: 7, cursor: 'pointer', textAlign: 'center',
                    background: pendingDelay === d.v ? 'rgba(77,184,255,.12)' : 'var(--bg)',
                    border: `1px solid ${pendingDelay === d.v ? 'rgba(77,184,255,.4)' : 'var(--border)'}`,
                    transition: 'all .2s',
                  }}>
                    <div style={{ color: pendingDelay === d.v ? 'var(--blue)' : 'var(--text)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)' }}>{d.label}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 2 }}>{d.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Save sub-settings button */}
            <button
              onClick={saveSubSettings}
              disabled={saving}
              style={{
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                background: saving ? 'var(--bg4)' : 'rgba(0,229,160,.15)',
                color: saving ? 'var(--text3)' : 'var(--green)',
                border: `1px solid ${saving ? 'var(--border)' : 'rgba(0,229,160,.35)'}`,
                cursor: saving ? 'not-allowed' : 'pointer', transition: 'all .2s',
                alignSelf: 'flex-start',
              }}
            >
              {saving ? '⏳ Saving…' : '💾 Save Launch Options'}
            </button>
          </div>
        </div>

        {/* ── Status panel ── */}
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg4)' }}>
            <div style={{ color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600 }}>
              Startup Information
            </div>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <InfoRow
              label="Startup Status"
              value={isEnabled ? 'Enabled' : 'Disabled'}
              color={isEnabled ? 'var(--green)' : 'var(--text3)'}
            />
            <InfoRow
              label="OS Entry Verified"
              value={actualEnabled ? 'Confirmed ✓' : 'Not Found'}
              color={actualEnabled ? 'var(--green)' : isEnabled ? 'var(--amber)' : 'var(--text3)'}
            />
            <InfoRow
              label="Launch Mode"
              value={launchMode}
            />
            <InfoRow
              label="Startup Method"
              value={isEnabled ? methodLabel : '—'}
            />
            <InfoRow
              label="Startup Delay"
              value={isEnabled ? (status?.startup_delay ? `${status.startup_delay}s` : 'None') : '—'}
            />
            <InfoRow
              label="Platform"
              value={status?.platform || 'Unknown'}
            />
            <InfoRow
              label="Administrator"
              value={hasAdmin ? 'Yes' : 'No (Limited)'}
              color={hasAdmin ? 'var(--green)' : 'var(--amber)'}
            />
            <InfoRow
              label="Enabled At"
              value={fmtDate(status?.enabled_at)}
            />
            <InfoRow
              label="Last Startup"
              value={fmtDate(status?.last_startup)}
            />
          </div>
        </div>

        {/* ── Non-windows note ── */}
        {!isWin && (
          <div style={{
            background: 'rgba(77,184,255,.07)', border: '1px solid rgba(77,184,255,.2)',
            borderRadius: 10, padding: '12px 16px',
          }}>
            <div style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>🐧 Linux / macOS</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, lineHeight: 1.6 }}>
              On Linux/macOS, PARTH uses the <strong style={{ color: 'var(--text2)' }}>Startup Folder</strong> method (~/.config/autostart/). For a more robust solution, you can also run:
            </div>
            <pre style={{
              marginTop: 8, background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 12px', fontSize: 11,
              fontFamily: 'var(--mono)', color: 'var(--green)', overflowX: 'auto',
            }}>
              sudo bash scripts/install_service.sh{'\n'}sudo systemctl enable parth{'\n'}sudo systemctl start parth
            </pre>
          </div>
        )}

      </div>
    </>
  )
}
