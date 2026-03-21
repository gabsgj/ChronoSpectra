import { scaleLinear } from 'd3'
import { useMemo, useRef, useState } from 'react'

import type { RetrainingLogEntry, ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { getSvgCoordinates } from './getSvgCoordinates'
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

interface DriftPlotProps {
  points: RetrainingLogEntry[]
  thresholdMse?: number | null
  theme: ThemeMode
  chartHeightClass?: string
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

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return 'Timestamp unavailable'
  }
  return new Date(value).toLocaleString()
}

const buildPath = (
  points: RetrainingLogEntry[],
  valueAccessor: (point: RetrainingLogEntry) => number | null,
  maxValue: number,
) => {
  const width = CHART_WIDTH - PADDING.left - PADDING.right
  const height = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const resolveX = (index: number) => {
    if (points.length <= 1) {
      return PADDING.left + width / 2
    }
    return PADDING.left + (width * index) / (points.length - 1)
  }

  let hasStarted = false
  return points
    .map((point, index) => {
      const value = valueAccessor(point)
      if (value === null) {
        return null
      }
      const x = resolveX(index)
      const y =
        PADDING.top + height - (value / Math.max(maxValue, 1e-9)) * height
      const command = hasStarted ? 'L' : 'M'
      hasStarted = true
      return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .filter((segment): segment is string => segment !== null)
    .join(' ')
}

const resolveDelta = (entry: RetrainingLogEntry) => {
  if (entry.before_mse === null || entry.after_mse === null) {
    return null
  }
  return entry.after_mse - entry.before_mse
}

const DriftPlot = ({
  points,
  thresholdMse,
  theme,
  chartHeightClass = 'h-[21rem]',
}: DriftPlotProps) => {
  const colors = getChartColors(theme)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const allValues = [...points.flatMap((point) => [point.before_mse, point.after_mse]), thresholdMse ?? null]
    .filter((value): value is number => value !== null)
  const maxValue = allValues.length > 0 ? Math.max(...allValues) * 1.08 : 1
  const drawableHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const drawableWidth = CHART_WIDTH - PADDING.left - PADDING.right
  const yScale = scaleLinear()
    .domain([0, maxValue])
    .range([CHART_HEIGHT - PADDING.bottom, PADDING.top])
  const resolveX = (index: number) => {
    if (points.length <= 1) {
      return PADDING.left + drawableWidth / 2
    }
    return PADDING.left + (drawableWidth * index) / (points.length - 1)
  }
  const beforePath = buildPath(points, (point) => point.before_mse, maxValue)
  const afterPath = buildPath(points, (point) => point.after_mse, maxValue)
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex] ?? null

  const updateHover = (clientX: number) => {
    const coordinates = getSvgCoordinates(svgRef.current, clientX, 0)
    if (!coordinates || points.length === 0) {
      return
    }

    const clampedChartX = Math.min(
      Math.max(coordinates.x, PADDING.left),
      CHART_WIDTH - PADDING.right,
    )
    const ratio = (clampedChartX - PADDING.left) / Math.max(drawableWidth, 1)
    setHoveredIndex(Math.round(ratio * Math.max(points.length - 1, 0)))
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Drift chart"
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={(event) => updateHover(event.clientX)}
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
          const y = PADDING.top + drawableHeight - drawableHeight * offset
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
        {thresholdMse !== null && thresholdMse !== undefined ? (
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={yScale(thresholdMse)}
            y2={yScale(thresholdMse)}
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
        {hoveredPoint && hoveredIndex !== null ? (
          <>
            <line
              x1={resolveX(hoveredIndex)}
              x2={resolveX(hoveredIndex)}
              y1={PADDING.top}
              y2={CHART_HEIGHT - PADDING.bottom}
              stroke={colors.axis}
              strokeDasharray="5 6"
            />
            {hoveredPoint.before_mse !== null ? (
              <circle
                cx={resolveX(hoveredIndex)}
                cy={yScale(hoveredPoint.before_mse)}
                r="5"
                fill={colors.surface}
                stroke={colors.amberLine}
                strokeWidth="2.5"
              />
            ) : null}
            {hoveredPoint.after_mse !== null ? (
              <circle
                cx={resolveX(hoveredIndex)}
                cy={yScale(hoveredPoint.after_mse)}
                r="5"
                fill={colors.surface}
                stroke={colors.tealLine}
                strokeWidth="2.5"
              />
            ) : null}
          </>
        ) : null}
      </svg>

      {hoveredPoint && hoveredIndex !== null ? (
        <div
          className="pointer-events-none absolute z-10 w-72 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((resolveX(hoveredIndex) / CHART_WIDTH) * 100).toFixed(2)}% - 8rem), calc(100% - 18rem))`,
            top: '2.5rem',
          }}
        >
          <p className="font-semibold">{formatTimestamp(hoveredPoint.timestamp)}</p>
          <div className="mt-2 space-y-1 text-muted">
            <p>Mode: {hoveredPoint.mode?.replaceAll('_', ' ') ?? 'Unknown'}</p>
            <p>Reason: {hoveredPoint.reason ?? 'Unknown'}</p>
            <p>Before MSE: {formatMse(hoveredPoint.before_mse)}</p>
            <p>After MSE: {formatMse(hoveredPoint.after_mse)}</p>
            {resolveDelta(hoveredPoint) !== null ? (
              <p>Delta: {formatMse(resolveDelta(hoveredPoint))}</p>
            ) : null}
            {thresholdMse !== null && thresholdMse !== undefined ? (
              <p>Threshold: {formatMse(thresholdMse)}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
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
  const successfulEntries = useMemo(() => {
    return entries.filter((entry) => entry.status === 'success')
  }, [entries])
  const exportRows = useMemo(() => {
    return entries.map((entry) => ({
      after_mse: entry.after_mse,
      before_mse: entry.before_mse,
      checkpoint_path: entry.checkpoint_path,
      duration_seconds: entry.duration_seconds,
      error: entry.error,
      mode: entry.mode,
      reason: entry.reason,
      report_path: entry.report_path,
      status: entry.status,
      stock_id: entry.stock_id,
      timestamp: entry.timestamp,
    }))
  }, [entries])

  return (
    <TrackChartCard
      title="Drift Chart"
      detail="Logged MSE snapshots from retraining runs show how the stock behaved before and after each refresh. Hover a point to inspect the actual run context."
      loading={loading}
      empty={successfulEntries.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="retraining-drift"
      exportRows={exportRows}
      exportJson={{ entries, threshold_mse: thresholdMse ?? null }}
      expandedChildren={
        <DriftPlot
          points={successfulEntries}
          thresholdMse={thresholdMse}
          theme={theme}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <div className="flex flex-wrap gap-4">
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
            {thresholdMse !== null && thresholdMse !== undefined ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-4 bg-muted" />
                Drift threshold
              </span>
            ) : null}
          </div>
          <p>Successful retrains: {successfulEntries.length}</p>
        </div>
      }
    >
      <DriftPlot
        points={successfulEntries}
        thresholdMse={thresholdMse}
        theme={theme}
      />
    </TrackChartCard>
  )
}
