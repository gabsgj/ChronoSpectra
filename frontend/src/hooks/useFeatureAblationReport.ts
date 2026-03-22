import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { FeatureAblationReportResponse, VariantModelMode } from '../types'
import { formatApiError } from './formatApiError'

interface FeatureAblationState {
  data: FeatureAblationReportResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
  isRunning: boolean
}

const buildInitialState = (): FeatureAblationState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
  isRunning: false,
})

const featureAblationCache = new Map<string, FeatureAblationReportResponse>()
const inFlightFeatureAblationRequests = new Map<
  string,
  Promise<FeatureAblationReportResponse>
>()

const buildCacheKey = (stockId: string, mode: VariantModelMode) => {
  return `${stockId}:${mode}`
}

export const useFeatureAblationReport = (
  stockId: string,
  mode: VariantModelMode,
) => {
  const [state, setState] = useState<FeatureAblationState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchStoredReport = useEffectEvent(async (signal: AbortSignal) => {
    const cacheKey = buildCacheKey(stockId, mode)
    const cachedReport = featureAblationCache.get(cacheKey) ?? null

    setState((currentState) => {
      const hasMatchingData =
        (currentState.data?.stock_id === stockId && currentState.data?.mode === mode) ||
        cachedReport !== null
      return {
        data: cachedReport ?? (hasMatchingData ? currentState.data : null),
        error: null,
        hint: null,
        isLoading: !hasMatchingData && cachedReport === null,
        isRefreshing: hasMatchingData && cachedReport === null,
        isRunning: currentState.isRunning,
      }
    })

    if (cachedReport !== null) {
      return
    }

    try {
      const request =
        inFlightFeatureAblationRequests.get(cacheKey) ??
        apiClient.getFeatureAblationReport(stockId, { mode })

      if (!inFlightFeatureAblationRequests.has(cacheKey)) {
        inFlightFeatureAblationRequests.set(cacheKey, request)
      }

      const data = await request
      if (signal.aborted) {
        return
      }
      featureAblationCache.set(cacheKey, data)
      setState((currentState) => ({
        ...currentState,
        data,
        error: null,
        hint: null,
        isLoading: false,
        isRefreshing: false,
      }))
    } catch (error) {
      if (signal.aborted) {
        return
      }
      const formattedError = formatApiError(
        error,
        'Unable to load the saved feature ablation report.',
      )
      setState((currentState) => ({
        ...currentState,
        error: formattedError.error,
        hint: formattedError.hint,
        isLoading: false,
        isRefreshing: false,
      }))
    } finally {
      inFlightFeatureAblationRequests.delete(cacheKey)
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    void fetchStoredReport(controller.signal)
    return () => controller.abort()
  }, [mode, requestVersion, stockId])

  const run = async (epochs = 30) => {
    const cacheKey = buildCacheKey(stockId, mode)
    featureAblationCache.delete(cacheKey)
    inFlightFeatureAblationRequests.delete(cacheKey)
    setState((currentState) => ({
      ...currentState,
      isRunning: true,
      error: null,
      hint: null,
    }))
    try {
      const data = await apiClient.runFeatureAblation(stockId, {
        mode,
        epochs,
      })
      featureAblationCache.set(cacheKey, data)
      setState({
        data,
        error: null,
        hint: null,
        isLoading: false,
        isRefreshing: false,
        isRunning: false,
      })
      return data
    } catch (error) {
      const formattedError = formatApiError(
        error,
        'Unable to run feature ablation.',
      )
      setState((currentState) => ({
        ...currentState,
        error: formattedError.error,
        hint: formattedError.hint,
        isLoading: false,
        isRefreshing: false,
        isRunning: false,
      }))
      return null
    }
  }

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        const cacheKey = buildCacheKey(stockId, mode)
        featureAblationCache.delete(cacheKey)
        inFlightFeatureAblationRequests.delete(cacheKey)
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
    run,
  }
}
