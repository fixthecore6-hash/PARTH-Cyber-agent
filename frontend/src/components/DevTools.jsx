import { useState } from 'react'

const BASE = window.__PARTH_BASE__ || '/api'

const SEV_COLOR = {
  Critical: 'var(--red)', High: '#fb923c', Medium: 'var(--amber)',
  Low: 'var(--green)', Info: 'var(--blue)', critical: 'var(--red)',
  high: '#fb923c', medium: 'var(--amber)', low: 'var(--green)',
}

const TOOLS = [
  { id: 'headers', label: '🔒 Headers & SSL', desc: 'Security headers + TLS audit' },
  { id: 'api',     label: '⚡ API Tester',    desc: 'Auth, rate-limits, debug endpoints' },
  { id: 'surface', label: '🌐 Surface Scan',  desc: 'Subdomains, live hosts, tech stack' },
  { id: 'nuclei',  label: '🎯 Nuclei',        desc: 'CVE & misconfiguration scanner' },
  { id: 'deps',    label: '📦 Dependencies',  desc: 'Trivy / OSV vulnerability scan' },
  { id: 'zap',     label: '🕷 OWASP ZAP',     desc: 'Full web app vulnerability scan' },
]

function post(path, body) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())
}

function Box({ children, style }) {
  return <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', ...style }}>{children}</div>
}

function Btn({ onClick, disabled, children, color = 'var(--blue)' }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? 'var(--bg2)' : `${color}22`,
      color: disabled ? 'var(--text3)' : color,
      border: `1px solid ${disabled ? 'var(--border)' : color}44`,
      borderRadius: 4, padding: '7px 18px', fontSize: 12,
      fontFamily: 'var(--mono)', cursor: disabled ? 'default' : 'pointer',
    }}>{children}</button>
  )
}

function Input({ value, onChange, placeholder, style }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)',
        borderRadius: 4, padding: '7px 10px', color: 'var(--text)',
        fontFamily: 'var(--mono)', fontSize: 12, ...style,
      }} />
  )
}

function AISummary({ text }) {
  if (!text) return null
  return (
    <Box style={{ borderLeft: '2px solid var(--green)', marginTop: 10 }}>
      <div style={{ color: 'var(--green)', fontSize: 11, marginBottom: 6, fontFamily: 'var(--mono)' }}>⚡ AI ANALYSIS</div>
      <div style={{ color: 'var(--text)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</div>
    </Box>
  )
}

function IssueList({ issues, color = 'var(--red)' }) {
  if (!issues?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
      {issues.map((x, i) => (
        <div key={i} style={{ fontSize: 12, fontFamily: 'var(--mono)', color, padding: '3px 0' }}>
          ▸ {typeof x === 'string' ? x : JSON.stringify(x)}
        </div>
      ))}
    </div>
  )
}

// ── Headers & SSL ──────────────────────────────────────────
function HeadersTool() {
  const [url, setUrl] = useState('https://')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setResult(null)
    try { setResult(await post('/dev/headers', { url })) } catch (e) { setResult({ error: String(e) }) }
    setLoading(false)
  }

  const gradeColor = g => ({ 'A+': 'var(--green)', A: 'var(--green)', B: 'var(--blue)', C: 'var(--amber)', D: '#fb923c', F: 'var(--red)' }[g] || 'var(--text)')

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input value={url} onChange={setUrl} placeholder="https://yoursite.com" />
        <Btn onClick={run} disabled={loading}>{loading ? 'Scanning…' : 'Analyze'}</Btn>
      </div>
      {result?.error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{result.error}</div>}
      {result && !result.error && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: gradeColor(result.grade), fontFamily: 'var(--mono)' }}>{result.grade}</div>
            <div>
              <div style={{ color: 'var(--text)', fontSize: 14 }}>Score: {result.score}/100</div>
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>HTTP {result.status_code}</div>
            </div>
            {result.ssl?.days_until_expiry !== undefined && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ color: result.ssl.days_until_expiry < 30 ? 'var(--red)' : 'var(--green)', fontSize: 12 }}>
                  SSL: {result.ssl.days_until_expiry}d left
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11 }}>{result.ssl.protocol} · {result.ssl.cipher_suite}</div>
              </div>
            )}
          </div>

          {result.missing_headers?.length > 0 && (
            <Box style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--amber)', fontSize: 11, marginBottom: 6, fontFamily: 'var(--mono)' }}>MISSING HEADERS ({result.missing_headers.length})</div>
              {result.missing_headers.map((h, i) => (
                <div key={i} style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)', padding: '2px 0' }}>✗ {h}</div>
              ))}
            </Box>
          )}

          {result.issues?.length > 0 && <IssueList issues={result.issues} color="var(--amber)" />}

          {result.fixes?.length > 0 && (
            <Box style={{ marginTop: 8, borderLeft: '2px solid var(--blue)' }}>
              <div style={{ color: 'var(--blue)', fontSize: 11, marginBottom: 6, fontFamily: 'var(--mono)' }}>QUICK FIXES</div>
              {result.fixes.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text2)', padding: '2px 0', fontFamily: 'var(--mono)' }}>▸ {f}</div>
              ))}
            </Box>
          )}

          <AISummary text={result.ai_fixes} />
        </>
      )}
    </div>
  )
}

// ── API Security Tester ────────────────────────────────────
function APITool() {
  const [url, setUrl] = useState('http://localhost:3000')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setResult(null)
    try { setResult(await post('/dev/api-test', { base_url: url })) } catch (e) { setResult({ error: String(e) }) }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input value={url} onChange={setUrl} placeholder="http://localhost:3000" />
        <Btn onClick={run} disabled={loading} color="var(--amber)">{loading ? 'Testing…' : 'Test API'}</Btn>
      </div>
      {result?.error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{result.error}</div>}
      {result && !result.error && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            <div style={{ color: result.total_issues > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>
              {result.total_issues} issues
            </div>
          </div>
          {result.exposed_endpoints?.length > 0 && (
            <Box style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 6, fontFamily: 'var(--mono)' }}>EXPOSED ENDPOINTS</div>
              {result.exposed_endpoints.map((e, i) => (
                <div key={i} style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)', padding: '2px 0' }}>
                  <span style={{ color: 'var(--red)' }}>[{e.status}]</span> {e.path}
                </div>
              ))}
            </Box>
          )}
          {result.method_issues?.length > 0 && (
            <Box style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--amber)', fontSize: 11, marginBottom: 6, fontFamily: 'var(--mono)' }}>DANGEROUS METHODS ALLOWED</div>
              {result.method_issues.map((m, i) => (
                <div key={i} style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--amber)', padding: '2px 0' }}>{m.method} {m.url}</div>
              ))}
            </Box>
          )}
          {result.auth_issues?.length > 0 && <IssueList issues={result.auth_issues.map(a => `Unauthenticated: ${a.path}`)} color="var(--red)" />}
          {result.rate_limit?.note && (
            <div style={{ color: 'var(--amber)', fontSize: 12, marginTop: 6 }}>⚠ {result.rate_limit.note}</div>
          )}
          <AISummary text={result.ai_summary} />
        </>
      )}
    </div>
  )
}

// ── Surface Discovery ──────────────────────────────────────
function SurfaceTool() {
  const [domain, setDomain] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setResult(null)
    try { setResult(await post('/dev/surface', { domain })) } catch (e) { setResult({ error: String(e) }) }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input value={domain} onChange={setDomain} placeholder="yourdomain.com" />
        <Btn onClick={run} disabled={loading} color="var(--purple)">{loading ? 'Discovering…' : 'Discover'}</Btn>
      </div>
      {result?.error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{result.error}</div>}
      {result && !result.error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Subdomains', val: result.subdomains?.length },
              { label: 'Live Hosts', val: result.live_hosts?.length },
              { label: 'Admin Panels', val: result.admin_panels?.length, danger: true },
            ].map(s => (
              <Box key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.danger && s.val > 0 ? 'var(--red)' : 'var(--text)', fontFamily: 'var(--mono)' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
              </Box>
            ))}
          </div>

          {result.admin_panels?.length > 0 && (
            <Box style={{ marginBottom: 8, borderLeft: '2px solid var(--red)' }}>
              <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 4, fontFamily: 'var(--mono)' }}>⚠ EXPOSED ADMIN PANELS</div>
              {result.admin_panels.map((p, i) => <div key={i} style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'var(--mono)' }}>{p}</div>)}
            </Box>
          )}

          {result.technologies?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {result.technologies.slice(0, 20).map((t, i) => (
                <span key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 8px', fontSize: 11, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{t}</span>
              ))}
            </div>
          )}

          {result.live_hosts?.length > 0 && (
            <Box style={{ maxHeight: 200, overflowY: 'auto' }}>
              <div style={{ color: 'var(--text3)', fontSize: 11, marginBottom: 6, fontFamily: 'var(--mono)' }}>LIVE HOSTS</div>
              {result.live_hosts.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 12, fontFamily: 'var(--mono)' }}>
                  <span style={{ color: h.status === 200 ? 'var(--green)' : 'var(--amber)' }}>[{h.status}]</span>
                  <span style={{ color: 'var(--blue)' }}>{h.url}</span>
                  {h.title && <span style={{ color: 'var(--text3)' }}>— {h.title}</span>}
                </div>
              ))}
            </Box>
          )}

          {result.subfinder_note && <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 6 }}>ℹ {result.subfinder_note}</div>}
          <AISummary text={result.ai_summary} />
        </>
      )}
    </div>
  )
}

// ── Nuclei ─────────────────────────────────────────────────
function NucleiTool() {
  const [target, setTarget] = useState('https://')
  const [severity, setSeverity] = useState('medium,high,critical')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setResult(null)
    try { setResult(await post('/dev/nuclei/scan', { target, severity })) } catch (e) { setResult({ error: String(e) }) }
    setLoading(false)
  }

  const SEVS = ['critical', 'high', 'medium', 'low', 'info']

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Input value={target} onChange={setTarget} placeholder="https://yoursite.com" />
        <Btn onClick={run} disabled={loading} color="var(--red)">{loading ? 'Scanning…' : 'Run Nuclei'}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {SEVS.map(s => {
          const active = severity.includes(s)
          return (
            <button key={s} onClick={() => {
              const parts = severity.split(',').filter(Boolean)
              const next = active ? parts.filter(p => p !== s) : [...parts, s]
              setSeverity(next.join(','))
            }} style={{
              background: active ? `${SEV_COLOR[s]}22` : 'var(--bg)',
              color: active ? SEV_COLOR[s] : 'var(--text3)',
              border: `1px solid ${active ? SEV_COLOR[s] + '44' : 'var(--border)'}`,
              borderRadius: 4, padding: '3px 10px', fontSize: 11, fontFamily: 'var(--mono)',
            }}>{s}</button>
          )
        })}
      </div>

      {result?.error && (
        <div>
          <div style={{ color: 'var(--red)', fontSize: 12 }}>{result.error}</div>
          {result.install && <pre style={{ color: 'var(--text3)', fontSize: 11, marginTop: 6 }}>{result.install}</pre>}
        </div>
      )}
      {result && !result.error && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            {Object.entries(result.counts || {}).map(([sev, cnt]) => (
              <div key={sev} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: SEV_COLOR[sev] || 'var(--text)' }}>{cnt}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sev}</div>
              </div>
            ))}
          </div>

          <Box style={{ maxHeight: 240, overflowY: 'auto' }}>
            {result.findings?.map((f, i) => (
              <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ color: SEV_COLOR[f.info?.severity], fontFamily: 'var(--mono)', fontSize: 11 }}>[{f.info?.severity}]</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{f.info?.name}</span>
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11, fontFamily: 'var(--mono)' }}>{f['matched-at']}</div>
                {f.info?.description && <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>{f.info.description.slice(0, 150)}</div>}
              </div>
            ))}
            {!result.findings?.length && <div style={{ color: 'var(--green)', fontSize: 12 }}>✓ No findings at selected severity levels</div>}
          </Box>

          <AISummary text={result.ai_summary} />
        </>
      )}
    </div>
  )
}

// ── Dependency Scanner ─────────────────────────────────────
function DepsTool() {
  const [path, setPath] = useState('.')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setResult(null)
    try { setResult(await post('/dev/deps', { path, scanner: 'auto' })) } catch (e) { setResult({ error: String(e) }) }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input value={path} onChange={setPath} placeholder="/path/to/project or . for current" />
        <Btn onClick={run} disabled={loading} color="var(--green)">{loading ? 'Scanning…' : 'Scan Deps'}</Btn>
      </div>
      {result?.error && (
        <div>
          <div style={{ color: 'var(--red)', fontSize: 12 }}>{result.error}</div>
          {result.note && <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>{result.note}</div>}
        </div>
      )}
      {result && !result.error && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            {Object.entries(result.counts || {}).map(([sev, cnt]) => (
              <div key={sev} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: SEV_COLOR[sev] || 'var(--text)' }}>{cnt}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sev}</div>
              </div>
            ))}
          </div>
          <Box style={{ maxHeight: 240, overflowY: 'auto' }}>
            {result.vulnerabilities?.map((v, i) => (
              <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: SEV_COLOR[v.severity] || 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>[{v.severity}]</span>
                  <span style={{ color: 'var(--text)' }}>{v.pkg} {v.version}</span>
                  {v.fixed_in && <span style={{ color: 'var(--green)', fontSize: 11 }}>→ fix: {v.fixed_in}</span>}
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11 }}>{v.id} — {v.title}</div>
              </div>
            ))}
            {!result.vulnerabilities?.length && <div style={{ color: 'var(--green)', fontSize: 12 }}>✓ No vulnerabilities found</div>}
          </Box>
          <AISummary text={result.ai_summary} />
        </>
      )}
    </div>
  )
}

// ── OWASP ZAP ──────────────────────────────────────────────
function ZAPTool() {
  const [url, setUrl] = useState('http://localhost:3000')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('')

  const run = async () => {
    setLoading(true); setResult(null)
    setPhase('Starting ZAP daemon…')
    try {
      await post('/dev/zap/start', {})
      setPhase('Spidering + active scanning (this takes a few minutes)…')
      const r = await post('/dev/zap/scan', { url })
      setResult(r)
    } catch (e) { setResult({ error: String(e) }) }
    setPhase('')
    setLoading(false)
  }

  return (
    <div>
      <Box style={{ marginBottom: 10, borderLeft: '2px solid var(--amber)' }}>
        <div style={{ color: 'var(--amber)', fontSize: 11 }}>⚠ Only scan sites you own or have explicit permission to test.</div>
      </Box>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input value={url} onChange={setUrl} placeholder="http://localhost:3000" />
        <Btn onClick={run} disabled={loading} color="var(--red)">{loading ? 'Scanning…' : 'Start ZAP Scan'}</Btn>
      </div>
      {phase && <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 8 }}>⏳ {phase}</div>}

      {result?.error && (
        <div>
          <div style={{ color: 'var(--red)', fontSize: 12 }}>{result.error}</div>
        </div>
      )}
      {result && !result.error && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            {Object.entries(result.counts || {}).map(([sev, cnt]) => (
              <div key={sev} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: SEV_COLOR[sev] || 'var(--text)' }}>{cnt}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sev}</div>
              </div>
            ))}
          </div>
          <Box style={{ maxHeight: 280, overflowY: 'auto' }}>
            {result.alerts?.map((a, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ color: SEV_COLOR[a.risk] || 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>[{a.risk}]</span>
                  <span style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>{a.name}</span>
                  {a.cweid && <span style={{ color: 'var(--text3)', fontSize: 10 }}>CWE-{a.cweid}</span>}
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11, fontFamily: 'var(--mono)' }}>{a.url}</div>
                {a.solution && <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>Fix: {a.solution.slice(0, 150)}</div>}
              </div>
            ))}
            {!result.alerts?.length && <div style={{ color: 'var(--green)', fontSize: 12 }}>✓ No vulnerabilities found</div>}
          </Box>
          <AISummary text={result.ai_summary} />
        </>
      )}
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────
const TOOL_COMPONENTS = {
  headers: HeadersTool,
  api: APITool,
  surface: SurfaceTool,
  nuclei: NucleiTool,
  deps: DepsTool,
  zap: ZAPTool,
}

export function DevTools() {
  const [active, setActive] = useState('headers')
  const ActiveTool = TOOL_COMPONENTS[active]

  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 90px)' }}>
      {/* Sidebar */}
      <div style={{ width: 180, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <div style={{ color: 'var(--text3)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 4px', marginBottom: 4 }}>Dev Tools</div>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)} style={{
            background: active === t.id ? 'var(--bg3)' : 'transparent',
            color: active === t.id ? 'var(--text)' : 'var(--text3)',
            border: active === t.id ? '1px solid var(--border2)' : '1px solid transparent',
            borderRadius: 6, padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
          }}>
            <div style={{ fontSize: 12 }}>{t.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '16px 18px', overflowY: 'auto',
      }}>
        <div style={{ color: 'var(--text2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          {TOOLS.find(t => t.id === active)?.label}
        </div>
        <ActiveTool />
      </div>
    </div>
  )
}
