import { useMemo } from 'react'

import type { LivePredictionMetrics, LivePredictionPoint } from '../types'

const resolveDirectionLabel = (spread: number | null) => {
  if (spread === null || spread === 0) {
    return 'Neutral'
  }
  return spread > 0 ? 'Bullish' : 'Bearish'
}

export const usePrediction = (history: LivePredictionPoint[]) => {
  return useMemo<LivePredictionMetrics>(() => {
    const latestPoint = history.at(-1)
    const spread = latestPoint ? latestPoint.spread : null

    return {
      actual: latestPoint?.actual ?? null,
      directionLabel: resolveDirectionLabel(spread),
      predicted: latestPoint?.predicted ?? null,
      sampleCount: history.length,
      spread,
    }
  }, [history])
}
