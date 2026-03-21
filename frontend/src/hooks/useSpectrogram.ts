import { startTransition, useEffect, useEffectEvent, useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import type {
  SpectrogramRequestParams,
  SpectrogramResponse,
  TransformName,
} from '../types'
import { formatApiError } from './formatApiError'

interface SpectrogramState {
  data: SpectrogramResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
}

interface UseSpectrogramOptions {
  stockId: string
  transform: TransformName
  parameters?: SpectrogramRequestParams
}

const buildInitialState = (): SpectrogramState => ({
  data: null,
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
})

const serializeParameters = (parameters: SpectrogramRequestParams | undefined) => {
  if (!parameters) {
    return ''
  }
  return JSON.stringify(
    Object.entries(parameters).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    ),
  )
}

export const useSpectrogram = ({
  stockId,
  transform,
  parameters,
}: UseSpectrogramOptions) => {
  const [state, setState] = useState<SpectrogramState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)
  const requestKey = useMemo(
    () => `${transform}:${serializeParameters(parameters)}`,
    [parameters, transform],
  )

  const fetchSpectrogram = useEffectEvent(async (signal: AbortSignal) => {
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
      const data = await apiClient.getSpectrogram(stockId, {
        transform,
        parameters,
        signal,
      })
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
      const formattedError = formatApiError(error, 'Unable to load spectrogram data.')
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
    void fetchSpectrogram(controller.signal)
    return () => controller.abort()
  }, [requestKey, requestVersion, stockId])

  return {
    ...state,
    retry: () => {
      startTransition(() => {
        setRequestVersion((currentValue) => currentValue + 1)
      })
    },
  }
}
