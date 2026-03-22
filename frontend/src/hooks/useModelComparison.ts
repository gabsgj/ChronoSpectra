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

const modelComparisonCache = new Map<string, ModelCompareResponse>()
const inFlightModelComparisonRequests = new Map<string, Promise<ModelCompareResponse>>()

export const useModelComparison = (stockId: string) => {
  const [state, setState] = useState<ModelComparisonState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchModelComparison = useEffectEvent(async (signal: AbortSignal) => {
    const cachedComparison = modelComparisonCache.get(stockId) ?? null

    setState((currentState) => {
      const hasMatchingData =
        currentState.data?.stock_id === stockId || cachedComparison !== null
      return {
        data: cachedComparison ?? (hasMatchingData ? currentState.data : null),
        isLoading: !hasMatchingData && cachedComparison === null,
        isRefreshing: hasMatchingData && cachedComparison === null,
        error: null,
        hint: null,
      }
    })

    if (cachedComparison !== null) {
      return
    }

    try {
      const request =
        inFlightModelComparisonRequests.get(stockId) ??
        apiClient.getModelComparison(stockId, signal)

      if (!inFlightModelComparisonRequests.has(stockId)) {
        inFlightModelComparisonRequests.set(stockId, request)
      }

      const data = await request
      if (signal.aborted) {
        return
      }
      modelComparisonCache.set(stockId, data)
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
      setState((currentState) => {
        const hasMatchingData = currentState.data?.stock_id === stockId
        return {
          data: hasMatchingData ? currentState.data : null,
          error: formattedError.error,
          hint: formattedError.hint,
          isLoading: false,
          isRefreshing: false,
        }
      })
    } finally {
      inFlightModelComparisonRequests.delete(stockId)
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
        modelComparisonCache.delete(stockId)
        inFlightModelComparisonRequests.delete(stockId)
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
