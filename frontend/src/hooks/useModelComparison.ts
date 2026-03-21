import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { ModelCompareResponse } from '../types'
import { formatApiError } from './formatApiError'

interface ModelComparisonState {
  data: ModelCompareResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): ModelComparisonState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

export const useModelComparison = (stockId: string) => {
  const [state, setState] = useState<ModelComparisonState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchModelComparison = useEffectEvent(async (signal: AbortSignal) => {
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.data === null,
      isRefreshing: currentState.data !== null,
      error: null,
      hint: null,
    }))

    try {
      const data = await apiClient.getModelComparison(stockId, signal)
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
      const formattedError = formatApiError(error, 'Unable to load model metrics.')
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
    void fetchModelComparison(controller.signal)
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
