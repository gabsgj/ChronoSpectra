import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { TrainingReportDetailResponse } from '../types'
import { formatApiError } from './formatApiError'

interface TrainingReportDetailState {
  data: TrainingReportDetailResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): TrainingReportDetailState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

export const useTrainingReportDetail = (stockId: string) => {
  const [state, setState] = useState<TrainingReportDetailState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchTrainingReportDetail = useEffectEvent(async (signal: AbortSignal) => {
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.data === null,
      isRefreshing: currentState.data !== null,
      error: null,
      hint: null,
    }))

    try {
      const data = await apiClient.getTrainingReportDetail(stockId, signal)
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
        'Unable to load the detailed training report.',
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
    void fetchTrainingReportDetail(controller.signal)
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
