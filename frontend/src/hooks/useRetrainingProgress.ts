import { useEffect, useState } from 'react'

import { apiClient } from '../api/client'
import type {
  RetrainingProgressEvent,
  RetrainingProgressSnapshot,
  RetrainingStartResponse,
} from '../types'
import { formatApiError } from './formatApiError'

type RetrainingProgressStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'completed'
  | 'error'

interface RetrainingProgressState {
  events: RetrainingProgressEvent[]
  error: string | null
  hint: string | null
  result: RetrainingProgressSnapshot['result']
  runInfo: RetrainingStartResponse | null
  snapshot: RetrainingProgressSnapshot | null
  status: RetrainingProgressStatus
}

const buildInitialState = (): RetrainingProgressState => ({
  events: [],
  error: null,
  hint: null,
  result: null,
  runInfo: null,
  snapshot: null,
  status: 'idle',
})

const mergeEvents = (
  currentEvents: RetrainingProgressEvent[],
  nextEvent: RetrainingProgressEvent,
) => {
  const deduplicated = currentEvents.filter((event) => {
    return event.event_id !== nextEvent.event_id
  })
  return [...deduplicated, nextEvent].slice(-120)
}

export const useRetrainingProgress = (stockId: string) => {
  const [state, setState] = useState<RetrainingProgressState>(buildInitialState)

  useEffect(() => {
    const runId = state.runInfo?.run_id
    if (!runId) {
      return
    }

    let closedByCompletion = false
    let cancelled = false
    let source: EventSource | null = null

    const handleSnapshot = (messageEvent: MessageEvent<string>) => {
      const payload = apiClient.parseRetrainingProgressEvent(
        messageEvent,
      ) as RetrainingProgressSnapshot
      if (payload.run_id !== runId) {
        return
      }
      setState((currentState) => ({
        ...currentState,
        events: payload.recent_events,
        result: payload.result,
        snapshot: payload,
        status: payload.is_running ? 'running' : 'completed',
      }))
    }

    const handleCompleted = (messageEvent: MessageEvent<string>) => {
      const payload = apiClient.parseRetrainingProgressEvent(
        messageEvent,
      ) as RetrainingProgressSnapshot
      if (payload.run_id !== runId) {
        return
      }
      closedByCompletion = true
      setState((currentState) => ({
        ...currentState,
        events: payload.recent_events,
        error: null,
        hint: null,
        result: payload.result,
        snapshot: payload,
        status: 'completed',
      }))
      source?.close()
    }

    void (async () => {
      try {
        const progressUrl = await apiClient.getRetrainingProgressUrl(runId)
        if (cancelled) {
          return
        }

        source = new EventSource(progressUrl)
        source.addEventListener('snapshot', handleSnapshot as EventListener)
        source.addEventListener('completed', handleCompleted as EventListener)

        source.onmessage = (messageEvent) => {
          const payload = apiClient.parseRetrainingProgressEvent(
            messageEvent,
          ) as RetrainingProgressEvent
          if (payload.run_id && payload.run_id !== runId) {
            return
          }
          setState((currentState) => ({
            ...currentState,
            events: mergeEvents(currentState.events, payload),
            status: payload.event === 'retraining_completed' ? 'completed' : 'running',
          }))
        }

        source.onerror = () => {
          if (closedByCompletion) {
            return
          }
          setState((currentState) => ({
            ...currentState,
            error: 'The retraining progress stream disconnected before completion.',
            status: currentState.status === 'completed' ? 'completed' : 'error',
          }))
          source?.close()
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        const formattedError = formatApiError(
          error,
          'Unable to open the retraining progress stream.',
        )
        setState((currentState) => ({
          ...currentState,
          error: formattedError.error,
          hint: formattedError.hint,
          status: 'error',
        }))
      }
    })()

    return () => {
      cancelled = true
      source?.close()
    }
  }, [state.runInfo?.run_id])

  return {
    ...state,
    start: async () => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        hint: null,
        events: [],
        result: null,
        runInfo: null,
        snapshot: null,
        status: 'starting',
      }))

      try {
        const runInfo = await apiClient.startRetraining(stockId)
        setState({
          events: [],
          error: null,
          hint: null,
          result: null,
          runInfo,
          snapshot: null,
          status: 'running',
        })
      } catch (error) {
        const formattedError = formatApiError(
          error,
          'Unable to start retraining.',
        )
        setState((currentState) => ({
          ...currentState,
          error: formattedError.error,
          hint: formattedError.hint,
          status: 'error',
        }))
      }
    },
    reset: () => {
      setState(buildInitialState())
    },
  }
}
