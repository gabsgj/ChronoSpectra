import type {
  LiveConnectionState,
  LivePredictionPoint,
  ThemeMode,
} from '../../types'
import { PredictionOverlayChart } from './PredictionOverlayChart'
import { TrackChartCard } from './TrackChartCard'

interface LivePredictionChartProps {
  points: LivePredictionPoint[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  connectionState: LiveConnectionState
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
  loading,
  error,
  hint,
  onRetry,
  connectionState,
  theme,
}: LivePredictionChartProps) => {
  return (
    <TrackChartCard
      title="Live Prediction Overlay"
      detail="Actual-versus-predicted price overlay from the live stream."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      footer={
        <p className="text-xs leading-5 text-muted">
          {connectionCopy[connectionState]}
        </p>
      }
    >
      <PredictionOverlayChart points={points} theme={theme} />
    </TrackChartCard>
  )
}
