import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { ModelBacktestResponse, VariantModelMode } from '../types'
import { formatApiError } from './formatApiError'

interface ModelBacktestState {
  data: ModelBacktestResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): ModelBacktestState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

const modelBacktestCache = new Map<string, ModelBacktestResponse>()
const inFlightModelBacktestRequests = new Map<string, Promise<ModelBacktestResponse>>()

const buildCacheKey = (
  stockId: string,
  limit: number,
  mode: VariantModelMode | null,
) => {
  return `${stockId}:${limit}:${mode ?? 'auto'}`
}

export const useModelBacktest = (
  stockId: string,
  limit = 60,
  mode: VariantModelMode | null = null,
) => {
  const [state, setState] = useState<ModelBacktestState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchModelBacktest = useEffectEvent(async (signal: AbortSignal) => {
    const cacheKey = buildCacheKey(stockId, limit, mode)
    const cachedBacktest = modelBacktestCache.get(cacheKey) ?? null

    setState((currentState) => {
      const hasMatchingData =
        (currentState.data?.stock_id === stockId && currentState.data?.mode === (mode ?? 'per_stock')) ||
        cachedBacktest !== null
      return {
        data: cachedBacktest ?? (hasMatchingData ? currentState.data : null),
        isLoading: !hasMatchingData && cachedBacktest === null,
        isRefreshing: hasMatchingData && cachedBacktest === null,
        error: null,
        hint: null,
      }
    })

    if (cachedBacktest !== null) {
      return
    }

    try {
      const request =
        inFlightModelBacktestRequests.get(cacheKey) ??
        apiClient.getModelBacktest(stockId, {
          limit,
          mode: mode ?? undefined,
          signal,
        })

      if (!inFlightModelBacktestRequests.has(cacheKey)) {
        inFlightModelBacktestRequests.set(cacheKey, request)
      }

      const data = await request
      if (signal.aborted) {
        return
      }
      modelBacktestCache.set(cacheKey, data)
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
      const formattedError = formatApiError(error, 'Unable to load backtest data.')
      setState((currentState) => {
        const hasMatchingData =
          currentState.data?.stock_id === stockId &&
          currentState.data?.mode === (mode ?? 'per_stock')
        return {
          data: hasMatchingData ? currentState.data : null,
          error: formattedError.error,
          hint: formattedError.hint,
          isLoading: false,
          isRefreshing: false,
        }
      })
    } finally {
      inFlightModelBacktestRequests.delete(cacheKey)
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    void fetchModelBacktest(controller.signal)
    return () => controller.abort()
  }, [limit, mode, requestVersion, stockId])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        const cacheKey = buildCacheKey(stockId, limit, mode)
        modelBacktestCache.delete(cacheKey)
        inFlightModelBacktestRequests.delete(cacheKey)
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
