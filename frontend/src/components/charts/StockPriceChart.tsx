import type { ThemeMode, TrackPoint } from '../../types'
import { LineTrackChart } from './LineTrackChart'
import { TrackChartCard } from './TrackChartCard'

interface StockPriceChartProps {
  points: TrackPoint[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const formatPrice = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

export const StockPriceChart = ({
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: StockPriceChartProps) => {
  const exportRows = points.map((point) => ({
    close_price: Number(point.value.toFixed(4)),
    timestamp: point.timestamp,
  }))

  return (
    <TrackChartCard
      title="Stock Price"
      detail="Daily closing-price history for the selected stock."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="stock-price"
      exportRows={exportRows}
      exportJson={{ points }}
      expandedChildren={
        <LineTrackChart
          points={points}
          theme={theme}
          tone="teal"
          formatValue={formatPrice}
          chartHeightClass="h-[30rem]"
        />
      }
      footer={
        <p className="text-xs leading-5 text-muted">
          Shares the active date window with the market-index and FX charts.
        </p>
      }
    >
      <LineTrackChart
        points={points}
        theme={theme}
        tone="teal"
        formatValue={formatPrice}
      />
    </TrackChartCard>
  )
}
