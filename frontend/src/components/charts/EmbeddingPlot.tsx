import { extent, scaleLinear, scaleOrdinal } from 'd3'
import { useMemo, useRef, useState } from 'react'

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

interface EmbeddingPlotViewProps {
  points: EmbeddingPoint[]
  theme: ThemeMode
  chartHeightClass?: string
}

const EmbeddingPlotView = ({
  points,
  theme,
  chartHeightClass = 'h-[22rem]',
}: EmbeddingPlotViewProps) => {
  const colors = getChartColors(theme)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null)
  const hoveredPoint = points.find((point) => point.id === hoveredPointId) ?? null
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
      '#7a8ba5',
    ])

  return (
    <div ref={wrapperRef} className="relative space-y-4">
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
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Embedding scatter plot"
        onMouseLeave={() => setHoveredPointId(null)}
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
            <g
              key={point.id}
              onMouseEnter={() => setHoveredPointId(point.id)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={hoveredPointId === point.id ? 11 : 9}
                fill={sectorScale(point.sector)}
                opacity="0.92"
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

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((xScale(hoveredPoint.x) / CHART_WIDTH) * 100).toFixed(2)}% - 7rem), calc(100% - 15rem))`,
            top: `clamp(3.5rem, calc(${((yScale(hoveredPoint.y) / CHART_HEIGHT) * 100).toFixed(2)}% + 1rem), calc(100% - 8rem))`,
          }}
        >
          <p className="font-semibold">{hoveredPoint.label}</p>
          <div className="mt-2 space-y-1 text-muted">
            <p>Ticker: {hoveredPoint.id}</p>
            <p>Sector: {hoveredPoint.sector}</p>
            <p>
              Projection: ({hoveredPoint.x.toFixed(3)}, {hoveredPoint.y.toFixed(3)})
            </p>
            <p>
              Nearby points imply similar embedding or fallback metric signatures,
              not identical prices.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const EmbeddingPlot = ({
  points,
  loading,
  error,
  hint,
  onRetry,
  theme,
  sourceLabel,
}: EmbeddingPlotProps) => {
  const exportRows = useMemo(() => {
    return points.map((point) => ({
      id: point.id,
      label: point.label,
      projection_x: Number(point.x.toFixed(8)),
      projection_y: Number(point.y.toFixed(8)),
      sector: point.sector,
    }))
  }, [points])

  return (
    <TrackChartCard
      title="Embedding Scatter Plot"
      detail="Each point is one stock in a 2D projection. Stocks that land closer together have more similar embedding behavior or fallback metric signatures than stocks that land far apart."
      loading={loading}
      empty={points.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="embedding-scatter"
      exportRows={exportRows}
      exportJson={{ points, sourceLabel }}
      expandedChildren={
        <EmbeddingPlotView
          points={points}
          theme={theme}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>{sourceLabel}</p>
          <p>{points.length} stocks projected</p>
        </div>
      }
    >
      <EmbeddingPlotView points={points} theme={theme} />
    </TrackChartCard>
  )
}
