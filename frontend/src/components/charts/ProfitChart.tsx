import type { ThemeMode, TrackPoint } from '../../types'
import { BarTrackChart } from './BarTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface ProfitChartProps {
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

export const ProfitChart = ({
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: ProfitChartProps) => {
  const exportRows = points.map((point) => ({
    profit_crores: Number(point.value.toFixed(4)),
    timestamp: point.timestamp,
  }))

  return (
    <TrackChartCard
      title="Profit"
      detail="Quarterly profit stays on reporting cadence and is not stretched into daily values."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="profit"
      exportRows={exportRows}
      exportJson={{ points }}
      expandedChildren={
        <BarTrackChart
          points={points}
          theme={theme}
          tone="teal"
          formatValue={formatCrores}
          chartHeightClass="h-[28rem]"
        />
      }
    >
      <BarTrackChart
        points={points}
        theme={theme}
        tone="teal"
        formatValue={formatCrores}
      />
    </TrackChartCard>
  )
}
