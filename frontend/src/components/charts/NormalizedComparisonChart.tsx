import { extent, max, min, scaleLinear, scaleTime } from 'd3'
import { useMemo, useRef, useState } from 'react'

import { getStockColor } from '../../config/stocksConfig'
import type { ThemeMode, TrackPoint } from '../../types'
import { getChartColors } from './getChartColors'
import { getSvgCoordinates } from './getSvgCoordinates'
import { TrackChartCard } from './TrackChartCard'

interface ComparisonSeries {
  color?: string
  id: string
  label: string
  points: TrackPoint[]
}

interface NormalizedComparisonChartProps {
  series: ComparisonSeries[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

interface NormalizedPoint {
  normalizedValue: number
  rawValue: number
  timestamp: string
  timestampMs: number
}

interface NormalizedSeries extends ComparisonSeries {
  latestValue: number
  normalizedPoints: NormalizedPoint[]
}

interface HoveredEntry {
  color: string | undefined
  id: string
  label: string
  point: NormalizedPoint
}

const CHART_WIDTH = 920
const CHART_HEIGHT = 360
const PADDING = { top: 26, right: 34, bottom: 54, left: 64 }
const FALLBACK_END_TIMESTAMP = 86_400_000

const normalizeSeries = (points: TrackPoint[]): NormalizedPoint[] => {
  if (points.length === 0) {
    return []
  }

  const baseValue = points[0]?.value ?? 1
  return points
    .map((point) => {
      const timestampMs = new Date(point.timestamp).getTime()
      if (!Number.isFinite(timestampMs)) {
        return null
      }
      return {
        normalizedValue: (point.value / baseValue) * 100,
        rawValue: point.value,
        timestamp: point.timestamp,
        timestampMs,
      }
    })
    .filter((point): point is NormalizedPoint => point !== null)
}

const buildPath = (
  points: NormalizedPoint[],
  xScale: ReturnType<typeof scaleTime>,
  yScale: ReturnType<typeof scaleLinear>,
) => {
  if (points.length === 0) {
    return ''
  }

  return points
    .map((point, index) => {
      const x = Number(xScale(new Date(point.timestampMs)))
      const y = Number(yScale(point.normalizedValue))
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

const findNearestPoint = (
  points: NormalizedPoint[],
  hoveredTimestampMs: number,
) => {
  if (points.length === 0) {
    return null
  }

  return points.reduce((closestPoint, candidate) => {
    return Math.abs(candidate.timestampMs - hoveredTimestampMs) <
      Math.abs(closestPoint.timestampMs - hoveredTimestampMs)
      ? candidate
      : closestPoint
  }, points[0])
}

interface NormalizedComparisonPlotProps {
  normalizedSeries: NormalizedSeries[]
  theme: ThemeMode
  chartHeightClass?: string
}

const NormalizedComparisonPlot = ({
  normalizedSeries,
  theme,
  chartHeightClass = 'h-[24rem]',
}: NormalizedComparisonPlotProps) => {
  const colors = getChartColors(theme)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredTimestampMs, setHoveredTimestampMs] = useState<number | null>(null)
  const allValues = normalizedSeries.flatMap((entry) =>
    entry.normalizedPoints.map((point) => point.normalizedValue),
  )
  const allTimestamps = normalizedSeries.flatMap((entry) =>
    entry.normalizedPoints.map((point) => point.timestampMs),
  )
  const [minTimestamp, maxTimestamp] = extent(allTimestamps)
  const baseMinValue = min(allValues) ?? 95
  const baseMaxValue = max(allValues) ?? 105
  const valuePadding = Math.max((baseMaxValue - baseMinValue) * 0.08, 2)
  const minValue = Math.min(baseMinValue, 100) - valuePadding
  const maxValue = Math.max(baseMaxValue, 100) + valuePadding
  const xScale = scaleTime()
    .domain([
      new Date(minTimestamp ?? 0),
      new Date(maxTimestamp ?? FALLBACK_END_TIMESTAMP),
    ])
    .range([PADDING.left, CHART_WIDTH - PADDING.right])
  const yScale = scaleLinear()
    .domain([minValue, maxValue])
    .range([CHART_HEIGHT - PADDING.bottom, PADDING.top])
  const hoveredEntries: HoveredEntry[] = hoveredTimestampMs
    ? normalizedSeries
        .map((entry) => {
          const point = findNearestPoint(entry.normalizedPoints, hoveredTimestampMs)
          if (!point) {
            return null
          }
          return {
            color: entry.color,
            id: entry.id,
            label: entry.label,
            point,
          }
        })
        .filter((entry): entry is HoveredEntry => entry !== null)
    : []
  const referencePoint = hoveredEntries[0]?.point ?? null
  const hoverX = referencePoint
    ? xScale(new Date(referencePoint.timestampMs))
    : null

  const updateHover = (clientX: number) => {
    const coordinates = getSvgCoordinates(svgRef.current, clientX, 0)
    if (!coordinates) {
      return
    }

    const clampedChartX = Math.min(
      Math.max(coordinates.x, PADDING.left),
      CHART_WIDTH - PADDING.right,
    )
    const hoveredDate = xScale.invert(clampedChartX)
    setHoveredTimestampMs(hoveredDate.getTime())
  }

  return (
    <div className="relative space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {normalizedSeries.map((entry) => (
          <span key={entry.id} className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: entry.color ?? getStockColor(entry.id, colors.tealLine),
              }}
            />
            {entry.label} {entry.latestValue.toFixed(1)}
          </span>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Normalized stock comparison chart"
        onMouseLeave={() => setHoveredTimestampMs(null)}
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
          const value = minValue + (maxValue - minValue) * offset
          const y = yScale(value)
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
                {value.toFixed(1)}
              </text>
            </g>
          )
        })}

        <line
          x1={PADDING.left}
          x2={CHART_WIDTH - PADDING.right}
          y1={yScale(100)}
          y2={yScale(100)}
          stroke={colors.axis}
          strokeDasharray="6 5"
          opacity="0.75"
        />

        {normalizedSeries.map((entry) => (
          <path
            key={entry.id}
            d={buildPath(entry.normalizedPoints, xScale, yScale)}
            fill="none"
            stroke={entry.color ?? getStockColor(entry.id, colors.tealLine)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
          />
        ))}

        {hoverX !== null ? (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={PADDING.top}
            y2={CHART_HEIGHT - PADDING.bottom}
            stroke={colors.axis}
            strokeDasharray="5 6"
          />
        ) : null}

        {hoveredEntries.map((entry) => {
          const x = Number(xScale(new Date(entry.point.timestampMs)))
          const y = Number(yScale(entry.point.normalizedValue))
          return (
            <circle
              key={`${entry.id}-${entry.point.timestamp}`}
              cx={x}
              cy={y}
              r="5"
              fill={colors.surface}
              stroke={entry.color ?? getStockColor(entry.id, colors.tealLine)}
              strokeWidth="2.5"
            />
          )
        })}

        <text
          x={PADDING.left}
          y={CHART_HEIGHT - 18}
          fill={colors.axis}
          fontSize="11"
        >
          {minTimestamp ? new Date(minTimestamp).toLocaleDateString() : 'Start'}
        </text>
        <text
          x={CHART_WIDTH - PADDING.right}
          y={CHART_HEIGHT - 18}
          fill={colors.axis}
          fontSize="11"
          textAnchor="end"
        >
          {maxTimestamp ? new Date(maxTimestamp).toLocaleDateString() : 'Latest'}
        </text>
      </svg>

      {referencePoint ? (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${(((hoverX ?? PADDING.left) / CHART_WIDTH) * 100).toFixed(2)}% - 6rem), calc(100% - 14.5rem))`,
            top: '6.25rem',
          }}
        >
          <p className="font-semibold">
            {new Date(referencePoint.timestamp).toLocaleDateString()}
          </p>
          <div className="mt-2 space-y-1 text-muted">
            {hoveredEntries.map((entry) => (
              <p key={`${entry.id}-${entry.point.timestamp}`}>
                {entry.label}: {entry.point.normalizedValue.toFixed(1)} index, raw{' '}
                {entry.point.rawValue.toFixed(2)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const NormalizedComparisonChart = ({
  series,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: NormalizedComparisonChartProps) => {
  const normalizedSeries = useMemo<NormalizedSeries[]>(() => {
    return series
      .map<NormalizedSeries | null>((entry) => {
        const normalizedPoints = normalizeSeries(entry.points)
        if (normalizedPoints.length === 0) {
          return null
        }
        return {
          ...entry,
          latestValue: normalizedPoints.at(-1)?.normalizedValue ?? 100,
          normalizedPoints,
        }
      })
      .filter((entry): entry is NormalizedSeries => entry !== null)
  }, [series])

  const firstTimestamp = normalizedSeries[0]?.normalizedPoints[0]?.timestamp
  const lastTimestamp = normalizedSeries[0]?.normalizedPoints.at(-1)?.timestamp
  const exportRows = useMemo(() => {
    return normalizedSeries.flatMap((entry) =>
      entry.normalizedPoints.map((point) => ({
        normalized_index: Number(point.normalizedValue.toFixed(4)),
        raw_value: Number(point.rawValue.toFixed(4)),
        series_id: entry.id,
        series_label: entry.label,
        timestamp: point.timestamp,
      })),
    )
  }, [normalizedSeries])

  return (
    <TrackChartCard
      title="Normalized Comparison"
      detail="All enabled tracks are rebased to 100 on their own first visible point so relative strength stays comparable even when the raw price scales differ."
      loading={loading}
      empty={normalizedSeries.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="normalized-comparison"
      exportRows={exportRows}
      exportJson={normalizedSeries}
      expandedChildren={
        <NormalizedComparisonPlot
          normalizedSeries={normalizedSeries}
          theme={theme}
          chartHeightClass="h-[30rem]"
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>{normalizedSeries.length} tracks with comparable history</p>
          <p>
            Window: {firstTimestamp ? new Date(firstTimestamp).toLocaleDateString() : 'N/A'} to{' '}
            {lastTimestamp ? new Date(lastTimestamp).toLocaleDateString() : 'N/A'}
          </p>
        </div>
      }
    >
      <NormalizedComparisonPlot normalizedSeries={normalizedSeries} theme={theme} />
    </TrackChartCard>
  )
}
