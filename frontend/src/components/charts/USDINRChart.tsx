import type { ThemeMode, TrackPoint } from '../../types'
import { LineTrackChart } from './LineTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface USDINRChartProps {
  points: TrackPoint[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const formatFx = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export const USDINRChart = ({
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: USDINRChartProps) => {
  const exportRows = points.map((point) => ({
    timestamp: point.timestamp,
    usd_inr: Number(point.value.toFixed(4)),
  }))

  return (
    <TrackChartCard
      title="USD-INR"
      detail="Daily currency-pair track aligned with the price and index series."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="usd-inr"
      exportRows={exportRows}
      exportJson={{ points }}
      expandedChildren={
        <LineTrackChart
          points={points}
          theme={theme}
          tone="teal"
          formatValue={formatFx}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        <p className="text-xs leading-5 text-muted">
          Uses the same shared daily range filter as price and index.
        </p>
      }
    >
      <LineTrackChart
        points={points}
        theme={theme}
        tone="teal"
        formatValue={formatFx}
      />
    </TrackChartCard>
  )
}
