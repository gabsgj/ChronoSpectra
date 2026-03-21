import { useMemo } from 'react'

import type { SpectrogramResponse, ThemeMode, TrackPoint } from '../../types'
import { LineTrackChart } from './LineTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface DominantFrequencyTimelineChartProps {
  data: SpectrogramResponse | null
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const formatFrequency = (value: number) => `${value.toFixed(3)} cyc/day`

const formatCycleLength = (frequencyValue: number) => {
  if (frequencyValue <= 0) {
    return 'Longer than the sampled window'
  }

  const days = 1 / frequencyValue
  if (!Number.isFinite(days) || days > 365) {
    return 'Long regime cycle'
  }
  if (days >= 30) {
    return `${days.toFixed(0)} trading days`
  }
  return `${days.toFixed(1)} trading days`
}

export const DominantFrequencyTimelineChart = ({
  data,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: DominantFrequencyTimelineChartProps) => {
  const points = useMemo<TrackPoint[]>(() => {
    if (!data) {
      return []
    }

    return data.time_timestamps
      .map((timestamp, columnIndex) => {
        let dominantRowIndex = 0
        let dominantEnergy = Number.NEGATIVE_INFINITY

        for (let rowIndex = 0; rowIndex < data.spectrogram.length; rowIndex += 1) {
          const energy = data.spectrogram[rowIndex]?.[columnIndex] ?? 0
          if (energy > dominantEnergy) {
            dominantEnergy = energy
            dominantRowIndex = rowIndex
          }
        }

        return {
          timestamp,
          value: data.frequency_axis[dominantRowIndex] ?? 0,
        }
      })
      .filter((point) => Number.isFinite(point.value))
  }, [data])

  const latestPoint = points.at(-1) ?? null

  return (
    <TrackChartCard
      title="Dominant Frequency"
      detail="Tracks the strongest frequency band per time slice so regime shifts and volatility bursts become easier to spot than in the raw heatmap alone."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="dominant-frequency-timeline"
      exportRows={points.map((point) => ({
        dominant_frequency: Number(point.value.toFixed(8)),
        timestamp: point.timestamp,
      }))}
      exportJson={{ points, transform: data?.transform }}
      expandedChildren={
        <LineTrackChart
          points={points}
          theme={theme}
          tone="teal"
          formatValue={formatFrequency}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        latestPoint ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
            <span>Latest dominant band {formatFrequency(latestPoint.value)}</span>
            <span>{formatCycleLength(latestPoint.value)}</span>
          </div>
        ) : null
      }
    >
      <LineTrackChart
        points={points}
        theme={theme}
        tone="teal"
        formatValue={formatFrequency}
      />
    </TrackChartCard>
  )
}
