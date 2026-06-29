import { useEffect, useState, useCallback } from 'react'

const getBase = () => window.__PARTH_BASE__ || '/api'

export function useStats(intervalMs = 5000) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  const fetch_stats = useCallback(async () => {
    try {
      const r = await fetch(`${getBase()}/stats`)
      const d = await r.json()
      setStats(d)
      setError(null)
    } catch (e) {
      setError('Backend offline')
    }
  }, [])

  useEffect(() => {
    fetch_stats()
    const t = setInterval(fetch_stats, intervalMs)
    return () => clearInterval(t)
  }, [fetch_stats, intervalMs])

  return { stats, error }
}

export function useEvents(params = {}) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        limit: params.limit || 100,
        since_hours: params.since_hours || 24,
        ...(params.severity ? { severity: params.severity } : {}),
        ...(params.event_type ? { event_type: params.event_type } : {}),
      })
      const r = await fetch(`${getBase()}/events?${qs}`)
      const d = await r.json()
      setEvents(d.events || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [params.limit, params.since_hours, params.severity, params.event_type])

  useEffect(() => { load() }, [load])
  return { events, loading, reload: load }
}

export async function fetchThreatSummary() {
  const r = await fetch(`${getBase()}/threat-summary?since_hours=1`)
  return r.json()
}

export async function fetchProcesses() {
  const r = await fetch(`${getBase()}/processes`)
  return r.json()
}

export async function fetchConnections() {
  const r = await fetch(`${getBase()}/connections`)
  return r.json()
}

export async function runNmapScan(target = '127.0.0.1') {
  const r = await fetch(`${getBase()}/scan/nmap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target })
  })
  return r.json()
}
