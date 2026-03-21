import { max, scaleLinear } from 'd3'

import type { ThemeMode, TrainingEpochMetrics } from '../../types'
import { getChartColors } from './getChartColors'
import { TrackChartCard } from './TrackChartCard'

interface LossCurveChartProps {
  history: TrainingEpochMetrics[]
  liveHistory?: TrainingEpochMetrics[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 320
const PADDING = { top: 20, right: 24, bottom: 52, left: 56 }

const buildPath = (
  points: TrainingEpochMetrics[],
  key: 'train_loss' | 'val_loss',
  maxEpoch: number,
  maxLoss: number,
) => {
  if (points.length === 0) {
    return ''
  }

  const width = CHART_WIDTH - PADDING.left - PADDING.right
  const height = CHART_HEIGHT - PADDING.top - PADDING.bottom

  return points
    .map((point, index) => {
      const x =
        PADDING.left + (width * Math.max(point.epoch - 1, index)) / Math.max(maxEpoch - 1, 1)
      const y =
        PADDING.top +
        height -
        ((point[key] ?? 0) / Math.max(maxLoss, 1e-9)) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export const LossCurveChart = ({
  history,
  liveHistory = [],
  loading,
  error,
  hint,
  onRetry,
  theme,
}: LossCurveChartProps) => {
  const colors = getChartColors(theme)
  const allSeries = [...history, ...liveHistory]
  const maxEpoch = max(allSeries, (point) => point.epoch) ?? 1
  const maxLoss =
    max(allSeries.flatMap((point) => [point.train_loss, point.val_loss])) ?? 1
  const yScale = scaleLinear()
    .domain([0, maxLoss])
    .range([CHART_HEIGHT - PADDING.bottom, PADDING.top])
  const trainPath = buildPath(history, 'train_loss', maxEpoch, maxLoss)
  const valPath = buildPath(history, 'val_loss', maxEpoch, maxLoss)
  const liveTrainPath = buildPath(liveHistory, 'train_loss', maxEpoch, maxLoss)
  const liveValPath = buildPath(liveHistory, 'val_loss', maxEpoch, maxLoss)

  return (
    <TrackChartCard
      title="Loss Curve"
      detail="Historical train and validation losses come from the saved training report; live dashed traces appear while a new retraining run is in progress."
      loading={loading}
      empty={history.length === 0 && liveHistory.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      footer={
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors.tealLine }}
            />
            Historical train
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors.amberLine }}
            />
            Historical val
          </span>
          {liveHistory.length > 0 ? (
            <>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-teal/60" />
                Live train
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-amber/60" />
                Live val
              </span>
            </>
          ) : null}
        </div>
      }
    >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-[22rem] w-full overflow-hidden rounded-[24px]"
          role="img"
          aria-label="Training loss curve"
        >
        <rect
          x="0"
          y="0"
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          rx="22"
          fill={colors.surface}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((offset) => {
          const y = yScale(maxLoss * offset)
          return (
            <g key={offset}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke={colors.grid}
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 10}
                y={y + 4}
                fill={colors.axis}
                fontSize="11"
                textAnchor="end"
              >
                {(maxLoss * offset).toFixed(offset === 0 ? 0 : 2)}
              </text>
            </g>
          )
        })}
        <path
          d={trainPath}
          fill="none"
          stroke={colors.tealLine}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
        <path
          d={valPath}
          fill="none"
          stroke={colors.amberLine}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
        {liveTrainPath ? (
          <path
            d={liveTrainPath}
            fill="none"
            stroke={colors.tealLine}
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ) : null}
        {liveValPath ? (
          <path
            d={liveValPath}
            fill="none"
            stroke={colors.amberLine}
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ) : null}
        <text
          x={PADDING.left}
          y={CHART_HEIGHT - 18}
          fill={colors.axis}
          fontSize="11"
        >
          Epoch 1
        </text>
        <text
          x={CHART_WIDTH - PADDING.right}
          y={CHART_HEIGHT - 18}
          fill={colors.axis}
          fontSize="11"
          textAnchor="end"
        >
          Epoch {maxEpoch}
        </text>
      </svg>
    </TrackChartCard>
  )
}
