import type { ThemeMode, TrackPoint } from '../../types'
import { LineTrackChart } from './LineTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface MarketIndexChartProps {
  points: TrackPoint[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const formatIndex = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(value)
}

export const MarketIndexChart = ({
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: MarketIndexChartProps) => {
  const exportRows = points.map((point) => ({
    market_index_value: Number(point.value.toFixed(4)),
    timestamp: point.timestamp,
  }))

  return (
    <TrackChartCard
      title="Market Index"
      detail="Broad-market benchmark aligned to the same daily timestamps as price."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="market-index"
      exportRows={exportRows}
      exportJson={{ points }}
      expandedChildren={
        <LineTrackChart
          points={points}
          theme={theme}
          tone="amber"
          formatValue={formatIndex}
          chartHeightClass="h-[28rem]"
        />
      }
    >
      <LineTrackChart
        points={points}
        theme={theme}
        tone="amber"
        formatValue={formatIndex}
      />
    </TrackChartCard>
  )
}
