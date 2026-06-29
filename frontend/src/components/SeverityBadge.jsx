export function SeverityBadge({ severity }) {
  const s = (severity || 'info').toLowerCase()
  return (
    <span className={`sev-${s}`} style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontFamily: 'var(--mono)',
    }}>
      {s}
    </span>
  )
}
