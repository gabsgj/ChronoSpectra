import type { ThemeMode, TrackPoint } from '../../types'
import { BarTrackChart } from './BarTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface RevenueChartProps {
  points: TrackPoint[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const formatCrores = (value: number) => {
  return `${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(value)} Cr`
}

export const RevenueChart = ({
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: RevenueChartProps) => {
  const exportRows = points.map((point) => ({
    revenue_crores: Number(point.value.toFixed(4)),
    timestamp: point.timestamp,
  }))

  return (
    <TrackChartCard
      title="Revenue"
      detail="Quarterly revenue stays quarter-based rather than daily-expanded."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="revenue"
      exportRows={exportRows}
      exportJson={{ points }}
      expandedChildren={
        <BarTrackChart
          points={points}
          theme={theme}
          tone="amber"
          formatValue={formatCrores}
          chartHeightClass="h-[28rem]"
        />
      }
    >
      <BarTrackChart
        points={points}
        theme={theme}
        tone="amber"
        formatValue={formatCrores}
      />
    </TrackChartCard>
  )
}
