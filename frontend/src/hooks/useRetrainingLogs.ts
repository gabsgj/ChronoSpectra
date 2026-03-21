import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { RetrainingLogCollectionResponse } from '../types'
import { formatApiError } from './formatApiError'

interface RetrainingLogsState {
  data: RetrainingLogCollectionResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): RetrainingLogsState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

export const useRetrainingLogs = () => {
  const [state, setState] = useState<RetrainingLogsState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchRetrainingLogs = useEffectEvent(async (signal: AbortSignal) => {
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.data === null,
      isRefreshing: currentState.data !== null,
      error: null,
      hint: null,
    }))

    try {
      const data = await apiClient.getRetrainingLogs(signal)
      if (signal.aborted) {
        return
      }
      setState({
        data,
        error: null,
        hint: null,
        isLoading: false,
        isRefreshing: false,
      })
    } catch (error) {
      if (signal.aborted) {
        return
      }
      const formattedError = formatApiError(
        error,
        'Unable to load retraining logs.',
      )
      setState((currentState) => ({
        data: currentState.data,
        error: formattedError.error,
        hint: formattedError.hint,
        isLoading: false,
        isRefreshing: false,
      }))
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    void fetchRetrainingLogs(controller.signal)
    return () => controller.abort()
  }, [requestVersion])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
