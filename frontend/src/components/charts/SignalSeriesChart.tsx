import type { ReactNode } from 'react'

import type { ThemeMode, TrackPoint } from '../../types'
import { LineTrackChart } from './LineTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface SignalSeriesChartProps {
  title: string
  detail: string
  points: TrackPoint[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
  tone?: 'teal' | 'amber'
  formatValue: (value: number) => string
  valueKey: string
  footer?: ReactNode
}

export const SignalSeriesChart = ({
  title,
  detail,
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
  tone = 'teal',
  formatValue,
  valueKey,
  footer,
}: SignalSeriesChartProps) => {
  return (
    <TrackChartCard
      title={title}
      detail={detail}
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase={title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
      exportRows={points.map((point) => ({
        [valueKey]: Number(point.value.toFixed(8)),
        timestamp: point.timestamp,
      }))}
      exportJson={{ points }}
      expandedChildren={
        <LineTrackChart
          points={points}
          theme={theme}
          tone={tone}
          formatValue={formatValue}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={footer}
    >
      <LineTrackChart
        points={points}
        theme={theme}
        tone={tone}
        formatValue={formatValue}
      />
    </TrackChartCard>
  )
}
