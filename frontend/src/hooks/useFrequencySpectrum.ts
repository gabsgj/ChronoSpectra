import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type { FFTResponse } from '../types'
import { formatApiError } from './formatApiError'

interface FrequencySpectrumState {
  data: FFTResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

const buildInitialState = (): FrequencySpectrumState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

export const useFrequencySpectrum = (stockId: string) => {
  const [state, setState] = useState<FrequencySpectrumState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)

  const fetchSpectrum = useEffectEvent(async (signal: AbortSignal) => {
    setState((currentState) => {
      const hasMatchingData = currentState.data?.stock_id === stockId
      return {
        data: hasMatchingData ? currentState.data : null,
        isLoading: !hasMatchingData,
        isRefreshing: hasMatchingData,
        error: null,
        hint: null,
      }
    })

    try {
      const data = await apiClient.getFrequencySpectrum(stockId, signal)
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
        'Unable to load the frequency spectrum.',
      )
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
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    void fetchSpectrum(controller.signal)
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
