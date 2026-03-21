import type {
  LiveConnectionState,
  LivePredictionPoint,
  ThemeMode,
} from '../../types'
import { PredictionOverlayChart } from './PredictionOverlayChart'
import { TrackChartCard } from './TrackChartCard'

interface LivePredictionChartProps {
  points: LivePredictionPoint[]
  latestPoint?: LivePredictionPoint | null
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  connectionState: LiveConnectionState
  marketOpen: boolean
  theme: ThemeMode
}

const connectionCopy: Record<LiveConnectionState, string> = {
  closed: 'Exchange closed. The chart keeps the latest snapshot visible while the countdown takes over below.',
  connecting: 'Opening the live stream and waiting for the first prediction update.',
  error: 'The stream stopped after repeated reconnect attempts. Use retry to open it again.',
  idle: 'Choose a stock to open the live prediction stream.',
  live: 'Actual and predicted prices update as new live readings arrive.',
  reconnecting: 'The stream dropped, so the client is reconnecting with backoff.',
}

export const LivePredictionChart = ({
  points,
  latestPoint = null,
  loading,
  error,
  hint,
  onRetry,
  connectionState,
  marketOpen,
  theme,
}: LivePredictionChartProps) => {
  const effectiveLatestPoint = latestPoint ?? points.at(-1) ?? null
  const projectedPoint =
    effectiveLatestPoint?.prediction_target_at &&
    effectiveLatestPoint.prediction_horizon_days
      ? {
          predicted: effectiveLatestPoint.predicted,
          prediction_horizon_days: effectiveLatestPoint.prediction_horizon_days,
          prediction_mode: effectiveLatestPoint.prediction_mode,
          prediction_target_at: effectiveLatestPoint.prediction_target_at,
          reference_actual: effectiveLatestPoint.actual,
        }
      : null

  return (
    <TrackChartCard
      title="Live Prediction Overlay"
      detail="Actual-versus-predicted price overlay from the live stream. The forecast target uses the configured multi-day horizon instead of pretending to be a next-tick estimate."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="live-prediction-overlay"
      exportRows={points.map((point) => ({
        actual: Number(point.actual.toFixed(4)),
        market_open: point.market_open,
        predicted: Number(point.predicted.toFixed(4)),
        prediction_horizon_days: point.prediction_horizon_days ?? null,
        prediction_mode: point.prediction_mode,
        prediction_target_at: point.prediction_target_at ?? null,
        spread: Number(point.spread.toFixed(4)),
        timestamp: point.timestamp,
      }))}
      exportJson={{ connectionState, points, projectedPoint }}
      expandedChildren={
        <PredictionOverlayChart
          points={points}
          theme={theme}
          projectedPoint={projectedPoint}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.18em] ${
              marketOpen
                ? 'border-teal/25 bg-teal/10 text-teal'
                : 'border-amber/30 bg-amber/12 text-amber'
            }`}
          >
            {marketOpen ? 'Market Live' : 'After Hours'}
          </span>
          <p className="max-w-2xl">
            {marketOpen
              ? connectionCopy[connectionState]
              : 'Showing the last open-session overlay and extending the forecast toward the configured target date while the market is closed.'}
          </p>
        </div>
      }
    >
      <PredictionOverlayChart
        points={points}
        theme={theme}
        projectedPoint={projectedPoint}
      />
    </TrackChartCard>
  )
}
