import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { MarketStatusResponse } from '../types'
import { formatApiError } from './formatApiError'

interface ExchangeStatusesState {
  dataByExchange: Record<string, MarketStatusResponse>
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
  missingExchanges: string[]
}

const EXCHANGE_STATUS_TIMEOUT_MS = 8_000

const buildInitialState = (): ExchangeStatusesState => ({
  dataByExchange: {},
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
  missingExchanges: [],
})

export const useExchangeStatuses = (exchangeIds: string[]) => {
  const [state, setState] = useState<ExchangeStatusesState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)
  const exchangeIdsKey = exchangeIds.join('|')

  const fetchExchangeStatuses = useEffectEvent(async () => {
    setState((currentState) => ({
      ...currentState,
      isLoading: Object.keys(currentState.dataByExchange).length === 0,
      isRefreshing: Object.keys(currentState.dataByExchange).length > 0,
      error: null,
      hint: null,
      missingExchanges: [],
    }))

    const responses = await Promise.allSettled(
      exchangeIds.map(async (exchangeId) => {
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => {
          controller.abort()
        }, EXCHANGE_STATUS_TIMEOUT_MS)

        try {
          return {
            exchangeId,
            payload: await apiClient.getMarketStatus(exchangeId, controller.signal),
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(`Timed out loading market status for ${exchangeId}.`)
          }
          throw error
        } finally {
          window.clearTimeout(timeoutId)
        }
      }),
    )

    const dataByExchange: Record<string, MarketStatusResponse> = {}
    const missingExchanges: string[] = []

    responses.forEach((response, index) => {
      const exchangeId = exchangeIds[index]
      if (response.status === 'fulfilled') {
        dataByExchange[exchangeId] = response.value.payload
        return
      }
      missingExchanges.push(exchangeId)
    })

    if (Object.keys(dataByExchange).length === 0) {
      const firstFailure = responses.find((response) => response.status === 'rejected')
      const formattedError = formatApiError(
        firstFailure?.status === 'rejected' ? firstFailure.reason : null,
        'Unable to load exchange status summaries.',
      )
      setState({
        dataByExchange: {},
        error: formattedError.error,
        hint: formattedError.hint,
        isLoading: false,
        isRefreshing: false,
        missingExchanges,
      })
      return
    }

    setState({
      dataByExchange,
      error: null,
      hint:
        missingExchanges.length > 0
          ? `Missing exchange status for ${missingExchanges.join(', ')}.`
          : null,
      isLoading: false,
      isRefreshing: false,
      missingExchanges,
    })
  })

  useEffect(() => {
    void fetchExchangeStatuses()
  }, [exchangeIdsKey, requestVersion])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
