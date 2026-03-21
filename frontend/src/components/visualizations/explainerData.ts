import type { STFTFrame, STFTFramesResponse } from '../../types'

export interface ExplainerSignalPoint {
  index: number
  timestamp: string
  value: number
}

export interface ExplainerPredictionSnapshot {
  actualPrice: number
  futureActual: number
  predictedPrice: number
  delta: number
  deltaPercent: number
  bandLow: number
  bandHigh: number
  confidence: number
  dominantFrequency: number
}

const clamp = (value: number, minimum: number, maximum: number) => {
  return Math.min(Math.max(value, minimum), maximum)
}

const findFutureActual = (
  frame: STFTFrame,
  signal: ExplainerSignalPoint[],
  fallbackValue: number,
) => {
  const nextPoint =
    signal.find((point) => point.index >= frame.segment_end) ?? signal.at(-1)
  return nextPoint?.value ?? fallbackValue
}

export const buildSignalFromFrames = (
  data: STFTFramesResponse | null,
): ExplainerSignalPoint[] => {
  if (!data || data.frames.length === 0) {
    return []
  }

  const signalLength = data.frames.reduce((currentLength, frame) => {
    return Math.max(currentLength, frame.segment_end)
  }, 0)
  const values = new Array<number | null>(signalLength).fill(null)
  const timestamps = new Array<string>(signalLength).fill('')

  data.frames.forEach((frame) => {
    frame.segment.forEach((value, segmentIndex) => {
      const signalIndex = frame.segment_start + segmentIndex
      if (signalIndex >= signalLength) {
        return
      }
      values[signalIndex] = value
      timestamps[signalIndex] = frame.segment_timestamps[segmentIndex] ?? ''
    })
  })

  return values.flatMap((value, index) => {
    if (value === null) {
      return []
    }
    return {
      index,
      timestamp:
        timestamps[index] ??
        data.frames[0]?.segment_timestamps[0] ??
        data.frames[0]?.frame_timestamp ??
        'N/A',
      value,
    }
  })
}

export const buildPredictionSnapshot = (
  frame: STFTFrame | null,
  signal: ExplainerSignalPoint[],
  frequencyAxis: number[],
): ExplainerPredictionSnapshot | null => {
  if (!frame || frame.segment.length === 0) {
    return null
  }

  const actualPrice = frame.segment.at(-1) ?? 0
  const priorPrice = frame.segment.at(-2) ?? actualPrice
  const recentTrend = actualPrice - priorPrice
  const futureActual = findFutureActual(frame, signal, actualPrice)
  const dominantAmplitude = frame.fft_column.reduce(
    (currentBest, value) => Math.max(currentBest, value),
    0,
  )
  const dominantIndex = frame.fft_column.findIndex(
    (value) => value === dominantAmplitude,
  )
  const dominantFrequency = frequencyAxis[dominantIndex] ?? 0
  const columnMean =
    frame.fft_column.length === 0
      ? 0
      : frame.fft_column.reduce((total, value) => total + value, 0) /
        frame.fft_column.length
  const spectralLift = dominantAmplitude - columnMean
  const harmonicBias =
    actualPrice *
    0.008 *
    Math.cos(frame.frame_index * Math.max(dominantFrequency, 0.01) * Math.PI)
  const predictedPrice = Math.max(
    1,
    actualPrice + recentTrend * 1.6 + spectralLift * actualPrice * 0.015 + harmonicBias,
  )
  const delta = predictedPrice - futureActual
  const deltaPercent = futureActual === 0 ? 0 : (delta / futureActual) * 100
  const confidence = clamp(0.58 + dominantAmplitude * 0.22, 0.56, 0.94)
  const bandRadius = Math.max(
    Math.abs(delta) * 0.35,
    actualPrice * (1 - confidence) * 0.05,
  )

  return {
    actualPrice,
    futureActual,
    predictedPrice,
    delta,
    deltaPercent,
    bandLow: Math.max(1, predictedPrice - bandRadius),
    bandHigh: predictedPrice + bandRadius,
    confidence,
    dominantFrequency,
  }
}

export const buildProgressStops = (frameCount: number, targetDots = 10) => {
  if (frameCount <= 0) {
    return []
  }

  if (frameCount <= targetDots) {
    return Array.from({ length: frameCount }, (_, index) => index)
  }

  return Array.from({ length: targetDots }, (_, index) => {
    const position = index / (targetDots - 1)
    return Math.round(position * (frameCount - 1))
  })
}
