import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { apiClient } from '../api/client'
import type {
  FeatureEffectEntryResponse,
  FeatureEffectStockResponse,
  TrackPoint,
} from '../types'
import { formatApiError } from './formatApiError'

interface DashboardFeatureEffectsState {
  dataByStock: Record<string, FeatureEffectStockResponse>
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
  missingStockIds: string[]
}

const FEATURE_EFFECT_TIMEOUT_MS = 8_000

const buildInitialState = (): DashboardFeatureEffectsState => ({
  dataByStock: {},
  error: null,
  hint: null,
  isLoading: true,
  isRefreshing: false,
  missingStockIds: [],
})

const featureLabels: Record<FeatureEffectEntryResponse['feature'], string> = {
  price: 'Price',
  index: 'Market Index',
  usd_inr: 'USD/INR',
  revenue: 'Revenue',
  profit: 'Profit',
}

const buildReturns = (points: TrackPoint[]): number[] => {
  if (points.length < 2) {
    return []
  }
  const returns: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.value
    const current = points[index]?.value
    if (typeof previous !== 'number' || typeof current !== 'number' || previous === 0) {
      continue
    }
    returns.push((current - previous) / previous)
  }
  return returns
}

const pearsonCorrelation = (left: number[], right: number[]): number | null => {
  const length = Math.min(left.length, right.length)
  if (length < 3) {
    return null
  }

  const leftSlice = left.slice(-length)
  const rightSlice = right.slice(-length)
  const leftMean = leftSlice.reduce((sum, value) => sum + value, 0) / length
  const rightMean = rightSlice.reduce((sum, value) => sum + value, 0) / length

  let numerator = 0
  let leftVariance = 0
  let rightVariance = 0

  for (let index = 0; index < length; index += 1) {
    const leftDelta = leftSlice[index] - leftMean
    const rightDelta = rightSlice[index] - rightMean
    numerator += leftDelta * rightDelta
    leftVariance += leftDelta * leftDelta
    rightVariance += rightDelta * rightDelta
  }

  if (leftVariance === 0 || rightVariance === 0) {
    return null
  }

  return numerator / Math.sqrt(leftVariance * rightVariance)
}

const directionalAccuracy = (left: number[], right: number[]): number | null => {
  const length = Math.min(left.length, right.length)
  if (length < 3) {
    return null
  }

  let matches = 0
  for (let index = 0; index < length; index += 1) {
    const leftDirection = Math.sign(left[left.length - length + index])
    const rightDirection = Math.sign(right[right.length - length + index])
    if (leftDirection === rightDirection) {
      matches += 1
    }
  }

  return matches / length
}

const computeFeatureEffects = (stockId: string, marketData: Awaited<ReturnType<typeof apiClient.getMarketData>>): FeatureEffectStockResponse => {
  const priceReturns = buildReturns(marketData.tracks.price.points)

  const features: FeatureEffectEntryResponse[] = (['index', 'usd_inr', 'revenue', 'profit'] as const)
    .map((feature) => {
      const featureReturns = buildReturns(marketData.tracks[feature].points)
      const correlation = pearsonCorrelation(priceReturns, featureReturns)
      const direction = directionalAccuracy(priceReturns, featureReturns)
      const relativeStrength = correlation === null ? null : Math.abs(correlation) * 100

      return {
        feature,
        label: featureLabels[feature],
        frequency: 'Daily aligned returns',
        relative_strength: relativeStrength,
        pearson_correlation: correlation,
        directional_accuracy: direction,
      }
    })
    .sort((left, right) => {
      return (right.relative_strength ?? -1) - (left.relative_strength ?? -1)
    })

  return {
    stock_id: stockId,
    generated_at: new Date().toISOString(),
    features,
  }
}

export const useDashboardFeatureEffects = (stockIds: string[]) => {
  const [state, setState] = useState<DashboardFeatureEffectsState>(buildInitialState)
  const [requestVersion, setRequestVersion] = useState(0)
  const stockIdsKey = stockIds.join('|')

  const fetchFeatureEffects = useEffectEvent(async () => {
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
        }, FEATURE_EFFECT_TIMEOUT_MS)

        try {
          const marketData = await apiClient.getMarketData(stockId, controller.signal)
          return {
            stockId,
            payload: computeFeatureEffects(stockId, marketData),
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(`Timed out loading feature effects for ${stockId}.`)
          }
          throw error
        } finally {
          window.clearTimeout(timeoutId)
        }
      }),
    )

    const nextDataByStock: Record<string, FeatureEffectStockResponse> = {}
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
        'Unable to load dashboard feature effects.',
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
          ? `Missing feature snapshots for ${missingStockIds.join(', ')}.`
          : null,
      isLoading: false,
      isRefreshing: false,
      missingStockIds,
    })
  })

  useEffect(() => {
    void fetchFeatureEffects()
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
