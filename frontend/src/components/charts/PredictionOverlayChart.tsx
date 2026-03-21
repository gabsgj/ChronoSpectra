import type { LivePredictionPoint, ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'

interface PredictionOverlayChartProps {
  points: LivePredictionPoint[]
  theme: ThemeMode
}

const CHART_WIDTH = 860
const CHART_HEIGHT = 340
const PADDING_X = 22
const PADDING_Y = 24

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

const buildPath = (
  values: number[],
  minValue: number,
  maxValue: number,
) => {
  if (values.length === 0) {
    return ''
  }

  const drawableWidth = CHART_WIDTH - PADDING_X * 2
  const drawableHeight = CHART_HEIGHT - PADDING_Y * 2
  const range = maxValue - minValue || 1

  return values
    .map((value, index) => {
      const x =
        PADDING_X +
        (drawableWidth * index) / Math.max(values.length - 1, 1)
      const normalizedY = (value - minValue) / range
      const y = PADDING_Y + drawableHeight - normalizedY * drawableHeight
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export const PredictionOverlayChart = ({
  points,
  theme,
}: PredictionOverlayChartProps) => {
  const colors = getChartColors(theme)
  const hasPoints = points.length > 0
  const actualValues = points.map((point) => point.actual)
  const predictedValues = points.map((point) => point.predicted)
  const allValues = [...actualValues, ...predictedValues]
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1
  const actualPath = buildPath(actualValues, minValue, maxValue)
  const predictedPath = buildPath(predictedValues, minValue, maxValue)
  const latestPoint = points.at(-1)

  if (!hasPoints) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-[22px] border border-dashed border-stroke/70 text-sm text-muted">
        No overlay points are available yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-3xl font-semibold text-ink">
            {formatCurrency(latestPoint?.actual ?? 0)}
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Latest actual
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-2xl font-semibold text-ink">
            {formatCurrency(latestPoint?.predicted ?? 0)}
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Latest predicted
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colors.tealLine }}
          />
          Actual
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colors.amberLine }}
          />
          Predicted
        </span>
      </div>

        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-[22rem] w-full overflow-hidden rounded-[24px]"
          role="img"
          aria-label="Live prediction overlay chart"
        >
        <rect
          x="0"
          y="0"
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          rx="22"
          fill={colors.surface}
        />
        {[0.25, 0.5, 0.75].map((offset) => (
          <line
            key={offset}
            x1={PADDING_X}
            x2={CHART_WIDTH - PADDING_X}
            y1={PADDING_Y + offset * (CHART_HEIGHT - PADDING_Y * 2)}
            y2={PADDING_Y + offset * (CHART_HEIGHT - PADDING_Y * 2)}
            stroke={colors.grid}
            strokeWidth="1"
          />
        ))}
        <path
          d={actualPath}
          fill="none"
          stroke={colors.tealLine}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <path
          d={predictedPath}
          fill="none"
          stroke={colors.amberLine}
          strokeDasharray="8 6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
      </svg>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{new Date(points[0].timestamp).toLocaleTimeString()}</span>
        <span>
          {new Date(
            points.at(-1)?.timestamp ?? points[0].timestamp,
          ).toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}
