import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { TrainingReportCollectionResponse } from '../types'
import { formatApiError } from './formatApiError'

interface TrainingReportsState {
  data: TrainingReportCollectionResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): TrainingReportsState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

export const useTrainingReports = (stockId?: string) => {
  const [state, setState] = useState<TrainingReportsState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchTrainingReports = useEffectEvent(async (signal: AbortSignal) => {
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.data === null,
      isRefreshing: currentState.data !== null,
      error: null,
      hint: null,
    }))

    try {
      const data = await apiClient.getTrainingReports({
        stockId,
        signal,
      })
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
        'Unable to load training reports.',
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
    void fetchTrainingReports(controller.signal)
    return () => controller.abort()
  }, [requestVersion, stockId])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
