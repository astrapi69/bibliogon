/**
 * Generic WebSocket hook with auto-reconnect.
 *
 * Connects to the backend WS hub at ``/api/ws/{topic}`` and calls
 * ``onMessage`` for every JSON message received. Reconnects with
 * exponential backoff on unexpected disconnects (1s, 2s, 4s, ...
 * capped at 30s, gives up after 10 failures).
 *
 * Usage:
 * ```tsx
 * useWebSocket<AudiobookEvent>(
 *   `audiobook:${bookId}`,
 *   (msg) => updateState(msg),
 *   isActive,
 * );
 * ```
 */

import { useEffect, useRef } from 'react'

const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

function wsBaseUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/api`
}

export function useWebSocket<T = unknown>(
  topic: string,
  onMessage: (message: T) => void,
  enabled: boolean = true,
): void {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const retriesRef = useRef(0)

  useEffect(() => {
    if (!enabled || !topic) return

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    function connect() {
      if (closed) return
      ws = new WebSocket(`${wsBaseUrl()}/ws/${topic}`)

      ws.onopen = () => {
        retriesRef.current = 0
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as T
          onMessageRef.current(msg)
        } catch {
          // Malformed JSON — ignore
        }
      }

      ws.onclose = (e) => {
        if (closed) return
        // Code 1000 = normal close (we called ws.close()), don't reconnect
        if (e.code === 1000) return
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onerror is always followed by onclose, so reconnect happens there
      }
    }

    function scheduleReconnect() {
      if (closed) return
      if (retriesRef.current >= MAX_RETRIES) {
        console.warn(`useWebSocket: gave up reconnecting to "${topic}" after ${MAX_RETRIES} attempts`)
        return
      }
      const delay = Math.min(BASE_DELAY_MS * 2 ** retriesRef.current, MAX_DELAY_MS)
      retriesRef.current += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        ws.onclose = null // prevent reconnect on intentional close
        ws.close(1000)
      }
    }
  }, [topic, enabled])
}
