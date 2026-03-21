import type { RetrainingLogEntry, ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { TrackChartCard } from './TrackChartCard'

interface DriftChartProps {
  entries: RetrainingLogEntry[]
  thresholdMse?: number | null
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 300
const PADDING = { top: 24, right: 24, bottom: 44, left: 56 }

const formatMse = (value: number | null) => {
  if (value === null) {
    return 'N/A'
  }
  return value.toFixed(value >= 1000 ? 0 : 2)
}

const buildPath = (values: Array<number | null>, maxValue: number) => {
  const width = CHART_WIDTH - PADDING.left - PADDING.right
  const height = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const validPoints = values.filter((value): value is number => value !== null)
  if (validPoints.length === 0) {
    return ''
  }

  return values
    .map((value, index) => {
      if (value === null) {
        return null
      }
      const x = PADDING.left + (width * index) / Math.max(values.length - 1, 1)
      const y =
        PADDING.top + height - (value / Math.max(maxValue, 1e-9)) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .filter((segment): segment is string => segment !== null)
    .join(' ')
}

export const DriftChart = ({
  entries,
  thresholdMse,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: DriftChartProps) => {
  const colors = getChartColors(theme)
  const successfulEntries = entries.filter((entry) => entry.status === 'success')
  const beforeSeries = successfulEntries.map((entry) => entry.before_mse)
  const afterSeries = successfulEntries.map((entry) => entry.after_mse)
  const allValues = [...beforeSeries, ...afterSeries, thresholdMse ?? null].filter(
    (value): value is number => value !== null,
  )
  const maxValue = allValues.length > 0 ? Math.max(...allValues) * 1.08 : 1
  const beforePath = buildPath(beforeSeries, maxValue)
  const afterPath = buildPath(afterSeries, maxValue)
  const height = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const thresholdY =
    thresholdMse === null || thresholdMse === undefined
      ? null
      : PADDING.top + height - (thresholdMse / Math.max(maxValue, 1e-9)) * height

  return (
    <TrackChartCard
      title="Drift Chart"
      detail="Logged MSE snapshots from retraining runs show how the stock moved before and after each refresh, with the current drift threshold overlaid when available."
      loading={loading}
      empty={successfulEntries.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>Successful retrains: {successfulEntries.length}</p>
          <p>Current threshold: {formatMse(thresholdMse ?? null)}</p>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors.amberLine }}
            />
            Before retrain
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors.tealLine }}
            />
            After retrain
          </span>
          {thresholdY !== null ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-4 bg-muted" />
              Drift threshold
            </span>
          ) : null}
        </div>

        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-[21rem] w-full overflow-hidden rounded-[24px]"
          role="img"
          aria-label="Drift chart"
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
            const y = PADDING.top + height - height * offset
            return (
              <g key={offset}>
                <line
                  x1={PADDING.left}
                  x2={CHART_WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke={colors.grid}
                />
                <text
                  x={PADDING.left - 10}
                  y={y + 4}
                  fill={colors.axis}
                  fontSize="11"
                  textAnchor="end"
                >
                  {formatMse(maxValue * offset)}
                </text>
              </g>
            )
          })}
          {thresholdY !== null ? (
            <line
              x1={PADDING.left}
              x2={CHART_WIDTH - PADDING.right}
              y1={thresholdY}
              y2={thresholdY}
              stroke={colors.axis}
              strokeDasharray="6 6"
            />
          ) : null}
          <path
            d={beforePath}
            fill="none"
            stroke={colors.amberLine}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <path
            d={afterPath}
            fill="none"
            stroke={colors.tealLine}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
          />
        </svg>
      </div>
    </TrackChartCard>
  )
}
