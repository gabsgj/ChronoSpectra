import { startTransition, useEffect, useState } from 'react'

import { apiClient } from '../api/client'
import type {
  LiveConnectionState,
  LiveMarketEvent,
  LivePredictionPoint,
} from '../types'

const RECONNECT_DELAYS_MS = [1000, 2000, 4000]

interface LiveMarketState {
  connectionState: LiveConnectionState
  error: string | null
  history: LivePredictionPoint[]
  reconnectAttempt: number
  snapshot: LiveMarketEvent | null
}

const buildInitialState = (): LiveMarketState => ({
  connectionState: 'idle',
  error: null,
  history: [],
  reconnectAttempt: 0,
  snapshot: null,
})

const toPredictionPoint = (event: LiveMarketEvent): LivePredictionPoint => ({
  actual: event.actual,
  market_open: event.market_open,
  predicted: event.predicted,
  prediction_mode: event.prediction_mode,
  spread: event.predicted - event.actual,
  timestamp: event.timestamp,
})

const mergeHistoryPoint = (
  history: LivePredictionPoint[],
  point: LivePredictionPoint,
) => {
  const deduplicated = history.filter((existingPoint) => {
    return !(
      existingPoint.timestamp === point.timestamp &&
      existingPoint.predicted === point.predicted &&
      existingPoint.actual === point.actual
    )
  })

  return [...deduplicated, point].slice(-10)
}

export const useLiveMarket = (stockId: string) => {
  const [state, setState] = useState<LiveMarketState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    let allowReconnect = true
    let reconnectAttempt = 0
    let receivedClosedPayload = false
    let source: EventSource | null = null
    let reconnectTimer: number | null = null

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const closeSource = () => {
      source?.close()
      source = null
    }

    const openStream = () => {
      clearReconnectTimer()
      closeSource()

      setState((currentState) => ({
        ...currentState,
        connectionState: reconnectAttempt === 0 ? 'connecting' : 'reconnecting',
        error: null,
        reconnectAttempt,
      }))

      source = new EventSource(apiClient.getLiveStreamUrl(stockId))
      source.onmessage = (messageEvent) => {
        const payload = apiClient.parseLiveEvent(messageEvent)
        const point = toPredictionPoint(payload)

        reconnectAttempt = 0
        receivedClosedPayload = !payload.market_open

        setState((currentState) => ({
          connectionState: payload.market_open ? 'live' : 'closed',
          error: null,
          history: mergeHistoryPoint(currentState.history, point),
          reconnectAttempt: 0,
          snapshot: payload,
        }))

        if (!payload.market_open) {
          allowReconnect = false
          clearReconnectTimer()
          closeSource()
        }
      }

      source.onerror = () => {
        closeSource()

        if (receivedClosedPayload) {
          setState((currentState) => ({
            ...currentState,
            connectionState: 'closed',
          }))
          return
        }

        if (!allowReconnect) {
          return
        }

        if (reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
          setState((currentState) => ({
            ...currentState,
            connectionState: 'error',
            error: 'The live stream stopped after 3 reconnect attempts.',
            reconnectAttempt,
          }))
          allowReconnect = false
          return
        }

        reconnectAttempt += 1
        const delay =
          RECONNECT_DELAYS_MS[reconnectAttempt - 1] ??
          RECONNECT_DELAYS_MS.at(-1) ??
          4000

        setState((currentState) => ({
          ...currentState,
          connectionState: 'reconnecting',
          reconnectAttempt,
        }))

        clearReconnectTimer()
        reconnectTimer = window.setTimeout(openStream, delay)
      }
    }

    openStream()

    return () => {
      allowReconnect = false
      clearReconnectTimer()
      closeSource()
    }
  }, [requestVersion, stockId])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setState((currentState) => ({
          ...buildInitialState(),
          history: currentState.history,
        }))
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
