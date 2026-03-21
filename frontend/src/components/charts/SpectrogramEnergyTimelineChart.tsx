import { useMemo } from 'react'

import type { SpectrogramResponse, ThemeMode, TrackPoint } from '../../types'
import { LineTrackChart } from './LineTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface SpectrogramEnergyTimelineChartProps {
  data: SpectrogramResponse | null
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const formatEnergy = (value: number) => value.toFixed(3)

export const SpectrogramEnergyTimelineChart = ({
  data,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: SpectrogramEnergyTimelineChartProps) => {
  const points = useMemo<TrackPoint[]>(() => {
    if (!data) {
      return []
    }

    return data.time_timestamps
      .map((timestamp, columnIndex) => {
        let totalEnergy = 0
        let rowCount = 0

        for (let rowIndex = 0; rowIndex < data.spectrogram.length; rowIndex += 1) {
          totalEnergy += data.spectrogram[rowIndex]?.[columnIndex] ?? 0
          rowCount += 1
        }

        return {
          timestamp,
          value: rowCount === 0 ? 0 : Math.log1p(totalEnergy / rowCount),
        }
      })
      .filter((point) => Number.isFinite(point.value))
  }, [data])

  const strongestSlice = useMemo(() => {
    if (points.length === 0) {
      return null
    }
    return points.reduce((currentBest, point) => {
      if (point.value > currentBest.value) {
        return point
      }
      return currentBest
    }, points[0])
  }, [points])

  return (
    <TrackChartCard
      title="Energy Timeline"
      detail="Collapses the spectrogram into one time-series so we can see when the transform detects the strongest overall signal concentration."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="spectrogram-energy-timeline"
      exportRows={points.map((point) => ({
        log_energy: Number(point.value.toFixed(8)),
        timestamp: point.timestamp,
      }))}
      exportJson={{ points, transform: data?.transform }}
      expandedChildren={
        <LineTrackChart
          points={points}
          theme={theme}
          tone="amber"
          formatValue={formatEnergy}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        strongestSlice ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
            <span>Peak log-energy {formatEnergy(strongestSlice.value)}</span>
            <span>{new Date(strongestSlice.timestamp).toLocaleDateString()}</span>
          </div>
        ) : null
      }
    >
      <LineTrackChart
        points={points}
        theme={theme}
        tone="amber"
        formatValue={formatEnergy}
      />
    </TrackChartCard>
  )
}
