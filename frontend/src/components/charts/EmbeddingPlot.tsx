import { extent, scaleLinear, scaleOrdinal } from 'd3'

import type { ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { TrackChartCard } from './TrackChartCard'

export interface EmbeddingPoint {
  id: string
  label: string
  sector: string
  x: number
  y: number
}

interface EmbeddingPlotProps {
  points: EmbeddingPoint[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
  sourceLabel: string
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 320
const PADDING = { top: 20, right: 22, bottom: 32, left: 22 }

export const EmbeddingPlot = ({
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
  sourceLabel,
}: EmbeddingPlotProps) => {
  const colors = getChartColors(theme)
  const xExtent = extent(points, (point) => point.x)
  const yExtent = extent(points, (point) => point.y)
  const xScale = scaleLinear()
    .domain([(xExtent[0] ?? -1) - 0.3, (xExtent[1] ?? 1) + 0.3])
    .range([PADDING.left, CHART_WIDTH - PADDING.right])
  const yScale = scaleLinear()
    .domain([(yExtent[0] ?? -1) - 0.3, (yExtent[1] ?? 1) + 0.3])
    .range([CHART_HEIGHT - PADDING.bottom, PADDING.top])
  const sectorScale = scaleOrdinal<string, string>()
    .domain([...new Set(points.map((point) => point.sector))])
    .range([
      colors.tealLine,
      colors.amberLine,
      '#4f7cff',
      '#ef6b73',
      '#8d67ff',
    ])

  return (
    <TrackChartCard
      title="Embedding Scatter Plot"
      detail="This view is ready for the eventual stock-embedding t-SNE projection and currently clusters the active stocks with the best available saved signals."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>{sourceLabel}</p>
          <p>{points.length} stocks projected</p>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          {[...new Set(points.map((point) => point.sector))].map((sector) => (
            <span key={sector} className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: sectorScale(sector) }}
              />
              {sector}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-[22rem] w-full overflow-hidden rounded-[24px]"
          role="img"
          aria-label="Embedding scatter plot"
        >
          <rect
            x="0"
            y="0"
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            rx="22"
            fill={colors.surface}
          />
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={yScale(0)}
            y2={yScale(0)}
            stroke={colors.grid}
            strokeDasharray="5 5"
          />
          <line
            x1={xScale(0)}
            x2={xScale(0)}
            y1={PADDING.top}
            y2={CHART_HEIGHT - PADDING.bottom}
            stroke={colors.grid}
            strokeDasharray="5 5"
          />
          {points.map((point) => {
            const cx = xScale(point.x)
            const cy = yScale(point.y)
            return (
              <g key={point.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="9"
                  fill={sectorScale(point.sector)}
                  opacity="0.9"
                />
                <text
                  x={cx}
                  y={cy - 14}
                  fill={colors.axis}
                  fontSize="11"
                  textAnchor="middle"
                >
                  {point.id}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </TrackChartCard>
  )
}
