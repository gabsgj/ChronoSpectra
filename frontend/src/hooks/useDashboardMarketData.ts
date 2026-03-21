import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { MarketDataResponse } from '../types'
import { formatApiError } from './formatApiError'

interface DashboardMarketDataState {
  dataByStock: Record<string, MarketDataResponse>
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
  missingStockIds: string[]
}

const MARKET_DATA_TIMEOUT_MS = 8_000

const buildInitialState = (): DashboardMarketDataState => ({
  dataByStock: {},
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
  missingStockIds: [],
})

export const useDashboardMarketData = (stockIds: string[]) => {
  const [state, setState] = useState<DashboardMarketDataState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)
  const stockIdsKey = stockIds.join('|')

  const fetchDashboardMarketData = useEffectEvent(async () => {
    setState((currentState) => ({
      ...currentState,
      isLoading: Object.keys(currentState.dataByStock).length === 0,
      isRefreshing: Object.keys(currentState.dataByStock).length > 0,
      error: null,
      hint: null,
      missingStockIds: [],
    }))

    const responses = await Promise.allSettled(
      stockIds.map(async (stockId) => {
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => {
          controller.abort()
        }, MARKET_DATA_TIMEOUT_MS)

        try {
          return {
            stockId,
            payload: await apiClient.getMarketData(stockId, controller.signal),
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(`Timed out loading market data for ${stockId}.`)
          }
          throw error
        } finally {
          window.clearTimeout(timeoutId)
        }
      }),
    )

    const nextDataByStock: Record<string, MarketDataResponse> = {}
    const missingStockIds: string[] = []

    responses.forEach((response, index) => {
      const stockId = stockIds[index]
      if (response.status === 'fulfilled') {
        nextDataByStock[stockId] = response.value.payload
        return
      }
      missingStockIds.push(stockId)
    })

    if (Object.keys(nextDataByStock).length === 0) {
      const firstFailure = responses.find((response) => response.status === 'rejected')
      const formattedError = formatApiError(
        firstFailure?.status === 'rejected' ? firstFailure.reason : null,
        'Unable to load dashboard market data.',
      )
      setState({
        dataByStock: {},
        error: formattedError.error,
        hint: formattedError.hint,
        isLoading: false,
        isRefreshing: false,
        missingStockIds,
      })
      return
    }

    setState({
      dataByStock: nextDataByStock,
      error: null,
      hint:
        missingStockIds.length > 0
          ? `Missing live market snapshots for ${missingStockIds.join(', ')}.`
          : null,
      isLoading: false,
      isRefreshing: false,
      missingStockIds,
    })
  })

  useEffect(() => {
    void fetchDashboardMarketData()
  }, [requestVersion, stockIdsKey])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
