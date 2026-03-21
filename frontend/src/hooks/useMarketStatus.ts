import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { MarketStatusResponse } from '../types'
import { formatApiError } from './formatApiError'

interface MarketStatusState {
  data: MarketStatusResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): MarketStatusState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

export const useMarketStatus = (exchange: string) => {
  const [state, setState] = useState<MarketStatusState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchMarketStatus = useEffectEvent(async (signal: AbortSignal) => {
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.data === null,
      isRefreshing: currentState.data !== null,
      error: null,
      hint: null,
    }))

    try {
      const data = await apiClient.getMarketStatus(exchange, signal)
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
      const formattedError = formatApiError(error, 'Unable to load market status.')
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
    void fetchMarketStatus(controller.signal)
    return () => controller.abort()
  }, [exchange, requestVersion])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
