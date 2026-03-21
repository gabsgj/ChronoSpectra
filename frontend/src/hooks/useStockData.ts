import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import { formatApiError } from './formatApiError'
import type { MarketDataResponse } from '../types'

interface StockDataState {
  data: MarketDataResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): StockDataState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

export const useStockData = (stockId: string) => {
  const [state, setState] = useState<StockDataState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchStockData = useEffectEvent(async (signal: AbortSignal) => {
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.data === null,
      isRefreshing: currentState.data !== null,
      error: null,
      hint: null,
    }))

    try {
      const data = await apiClient.getMarketData(stockId, signal)
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
      const formattedError = formatApiError(error, 'Unable to load market data.')
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
    void fetchStockData(controller.signal)
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
