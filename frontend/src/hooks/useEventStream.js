import { useEffect, useRef, useState, useCallback } from 'react'

export function useEventStream() {
  const [events, setEvents]     = useState([])
  const [connected, setConnected] = useState(false)
  const wsRef           = useRef(null)
  const reconnectTimer  = useRef(null)

  const connect = useCallback(() => {
    // Use WS_BASE from App.jsx global if set (remote server), else relative
    let wsUrl
    try {
      const g = window.__PARTH_WS_BASE__
      wsUrl = g ? `${g}/ws/events` : (() => {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${proto}//${window.location.host}/ws/events`
      })()
    } catch {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${proto}//${window.location.host}/ws/events`
    }

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen    = () => { setConnected(true); if (reconnectTimer.current) clearTimeout(reconnectTimer.current) }
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'ping') return
        setEvents(prev => [data, ...prev].slice(0, 500))
      } catch {}
    }
    ws.onclose = () => { setConnected(false); reconnectTimer.current = setTimeout(connect, 3000) }
    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [connect])

  return { events, connected }
}
