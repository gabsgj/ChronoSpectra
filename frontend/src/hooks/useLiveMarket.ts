import { startTransition, useEffect, useState } from 'react'

import { apiClient } from '../api/client'
import type {
  LiveConnectionState,
  LiveMarketEvent,
  LivePredictionPoint,
  VariantModelMode,
} from '../types'
import { formatApiError } from './formatApiError'

const RECONNECT_DELAYS_MS = [1000, 2000, 4000]
const LIVE_HISTORY_LIMIT = 2048
const LIVE_STORAGE_PREFIX = 'chronospectra-live-history-v1'

interface LiveMarketState {
  connectionState: LiveConnectionState
  error: string | null
  hint: string | null
  history: LivePredictionPoint[]
  reconnectAttempt: number
  snapshot: LiveMarketEvent | null
}

const getStorageKey = (stockId: string, mode: VariantModelMode | null) => {
  return `${LIVE_STORAGE_PREFIX}:${stockId}:${mode ?? 'auto'}`
}

const readPersistedState = (stockId: string, mode: VariantModelMode | null): Pick<
  LiveMarketState,
  'history' | 'snapshot'
> => {
  try {
    const rawValue = window.localStorage.getItem(getStorageKey(stockId, mode))
    if (!rawValue) {
      return {
        history: [],
        snapshot: null,
      }
    }

    const parsedValue = JSON.parse(rawValue) as {
      history?: LivePredictionPoint[]
      snapshot?: LiveMarketEvent | null
    }

    return {
      history: Array.isArray(parsedValue.history) ? parsedValue.history : [],
      snapshot:
        parsedValue.snapshot && typeof parsedValue.snapshot === 'object'
          ? parsedValue.snapshot
          : null,
    }
  } catch {
    return {
      history: [],
      snapshot: null,
    }
  }
}

const writePersistedState = (
  stockId: string,
  mode: VariantModelMode | null,
  state: Pick<LiveMarketState, 'history' | 'snapshot'>,
) => {
  try {
    window.localStorage.setItem(getStorageKey(stockId, mode), JSON.stringify(state))
  } catch {
    // Ignore storage failures and keep the live session functional.
  }
}

const buildInitialState = (
  stockId: string,
  mode: VariantModelMode | null,
): LiveMarketState => {
  const persistedState = readPersistedState(stockId, mode)
  return {
    connectionState: persistedState.snapshot?.market_open ? 'connecting' : 'idle',
    error: null,
    hint: null,
    history: persistedState.history,
    reconnectAttempt: 0,
    snapshot: persistedState.snapshot,
  }
}

const toPredictionPoint = (event: LiveMarketEvent): LivePredictionPoint => ({
  actual: event.actual,
  market_open: event.market_open,
  predicted: event.predicted,
  prediction_horizon_days: event.prediction_horizon_days,
  prediction_mode: event.prediction_mode,
  prediction_target_at: event.prediction_target_at,
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

  return [...deduplicated, point].slice(-LIVE_HISTORY_LIMIT)
}

export const useLiveMarket = (
  stockId: string,
  mode: VariantModelMode | null,
) => {
  const [state, setState] = useState<LiveMarketState>(() => buildInitialState(stockId, mode))
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    setState(buildInitialState(stockId, mode))
  }, [mode, stockId])

  useEffect(() => {
    writePersistedState(stockId, mode, {
      history: state.history,
      snapshot: state.snapshot,
    })
  }, [mode, state.history, state.snapshot, stockId])

  useEffect(() => {
    let allowReconnect = true
    let reconnectAttempt = 0
    let receivedClosedPayload = false
    let source: EventSource | null = null
    let reconnectTimer: number | null = null
    const availabilityController = new AbortController()

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

    const setTerminalError = (error: string, hint: string | null = null) => {
      allowReconnect = false
      clearReconnectTimer()
      closeSource()
      setState((currentState) => ({
        ...currentState,
        connectionState: 'error',
        error,
        hint,
        reconnectAttempt,
      }))
    }

    const ensurePredictionAvailability = async () => {
      try {
        await apiClient.getPrediction(
          stockId,
          {
            mode: mode ?? undefined,
            signal: availabilityController.signal,
          },
        )
        if (availabilityController.signal.aborted) {
          return false
        }
        return true
      } catch (error) {
        if (availabilityController.signal.aborted) {
          return false
        }
        const formattedError = formatApiError(
          error,
          'Unable to prepare the live prediction stream.',
        )
        setTerminalError(formattedError.error, formattedError.hint)
        return false
      }
    }

    const openStream = () => {
      clearReconnectTimer()
      closeSource()

      setState((currentState) => ({
        ...currentState,
        connectionState: reconnectAttempt === 0 ? 'connecting' : 'reconnecting',
        error: null,
        hint: null,
        reconnectAttempt,
      }))

      source = new EventSource(apiClient.getLiveStreamUrl(stockId, mode))
      source.onmessage = (messageEvent) => {
        const payload = apiClient.parseLiveEvent(messageEvent)
        const point = toPredictionPoint(payload)

        reconnectAttempt = 0
        receivedClosedPayload = !payload.market_open

        setState((currentState) => ({
          connectionState: payload.market_open ? 'live' : 'closed',
          error: null,
          hint: null,
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
            hint: 'Retry once the backend prediction stream is available again.',
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

    void (async () => {
      const isReady = await ensurePredictionAvailability()
      if (!isReady || !allowReconnect) {
        return
      }
      openStream()
    })()

    return () => {
      allowReconnect = false
      availabilityController.abort()
      clearReconnectTimer()
      closeSource()
    }
  }, [mode, requestVersion, stockId])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setState((currentState) => ({
          ...buildInitialState(stockId, mode),
          history: currentState.history,
          snapshot: currentState.snapshot,
        }))
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
