import { useRef, useState } from 'react'

import type { ThemeMode, TrackPoint } from '../../types'
import { getChartColors } from './getChartColors'
import { getSvgCoordinates } from './getSvgCoordinates'

interface LineTrackChartProps {
  points: TrackPoint[]
  theme: ThemeMode
  tone: 'teal' | 'amber'
  formatValue: (value: number) => string
  chartHeightClass?: string
}

const CHART_WIDTH = 760
const CHART_HEIGHT = 320
const PADDING_X = 22
const PADDING_Y = 24

const buildPath = (
  points: TrackPoint[],
  minValue: number,
  maxValue: number,
) => {
  if (points.length === 0) {
    return ''
  }

  const drawableWidth = CHART_WIDTH - PADDING_X * 2
  const drawableHeight = CHART_HEIGHT - PADDING_Y * 2
  const valueRange = maxValue - minValue || 1

  return points
    .map((point, index) => {
      const x =
        PADDING_X +
        (drawableWidth * index) / Math.max(points.length - 1, 1)
      const normalizedY = (point.value - minValue) / valueRange
      const y = PADDING_Y + drawableHeight - normalizedY * drawableHeight
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

const buildAreaPath = (
  points: TrackPoint[],
  minValue: number,
  maxValue: number,
) => {
  if (points.length === 0) {
    return ''
  }

  const linePath = buildPath(points, minValue, maxValue)
  const drawableWidth = CHART_WIDTH - PADDING_X * 2
  const lastX =
    PADDING_X +
    (drawableWidth * (points.length - 1)) / Math.max(points.length - 1, 1)
  const baselineY = CHART_HEIGHT - PADDING_Y

  return `${linePath} L ${lastX.toFixed(2)} ${baselineY} L ${PADDING_X} ${baselineY} Z`
}

export const LineTrackChart = ({
  points,
  theme,
  tone,
  formatValue,
  chartHeightClass = 'h-[21rem]',
}: LineTrackChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const colors = getChartColors(theme)
  const values = points.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const latestValue = points.at(-1)?.value ?? 0
  const lineColor = tone === 'teal' ? colors.tealLine : colors.amberLine
  const fillColor = tone === 'teal' ? colors.tealFill : colors.amberFill
  const linePath = buildPath(points, minValue, maxValue)
  const areaPath = buildAreaPath(points, minValue, maxValue)
  const drawableWidth = CHART_WIDTH - PADDING_X * 2
  const drawableHeight = CHART_HEIGHT - PADDING_Y * 2
  const valueRange = maxValue - minValue || 1
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null
  const hoveredX =
    hoveredIndex === null
      ? null
      : PADDING_X + (drawableWidth * hoveredIndex) / Math.max(points.length - 1, 1)
  const hoveredY =
    hoveredPoint === null
      ? null
      : PADDING_Y +
        drawableHeight -
        ((hoveredPoint.value - minValue) / valueRange) * drawableHeight

  const updateHover = (clientX: number) => {
    const coordinates = getSvgCoordinates(svgRef.current, clientX, 0)
    if (!coordinates) {
      return
    }

    const clampedChartX = Math.min(
      Math.max(coordinates.x, PADDING_X),
      CHART_WIDTH - PADDING_X,
    )
    const normalizedX =
      (clampedChartX - PADDING_X) / Math.max(drawableWidth, 1)
    const nextIndex = Math.round(normalizedX * Math.max(points.length - 1, 0))
    setHoveredIndex(nextIndex)
  }

  return (
    <div className="relative space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-ink lg:text-4xl">
            {formatValue(latestValue)}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
            Latest value
          </p>
        </div>
        <div className="text-right text-xs leading-5 text-muted">
          <p>Low: {formatValue(minValue)}</p>
          <p>High: {formatValue(maxValue)}</p>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Time series chart"
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
        <path d={areaPath} fill={fillColor} />
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hoveredPoint && hoveredX !== null && hoveredY !== null ? (
          <>
            <line
              x1={hoveredX}
              x2={hoveredX}
              y1={PADDING_Y}
              y2={CHART_HEIGHT - PADDING_Y}
              stroke={colors.axis}
              strokeDasharray="5 6"
              opacity="0.9"
            />
            <circle
              cx={hoveredX}
              cy={hoveredY}
              r="6"
              fill={colors.surface}
              stroke={lineColor}
              strokeWidth="3"
            />
          </>
        ) : null}
      </svg>

      {hoveredPoint && hoveredX !== null && hoveredY !== null ? (
        <div
          className="pointer-events-none absolute z-10 rounded-[18px] border border-stroke/70 bg-card/95 px-3 py-2 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((hoveredX / CHART_WIDTH) * 100).toFixed(2)}% + 0.5rem), calc(100% - 13rem))`,
            top: '6.25rem',
            width: '12rem',
          }}
        >
          <p className="font-semibold">
            {new Date(hoveredPoint.timestamp).toLocaleString()}
          </p>
          <p className="mt-1 text-muted">
            Value: {formatValue(hoveredPoint.value)}
          </p>
          <p className="text-muted">
            Range: {formatValue(minValue)} to {formatValue(maxValue)}
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{new Date(points[0]?.timestamp ?? '').toLocaleDateString()}</span>
        <span>
          {new Date(
            points.at(-1)?.timestamp ?? points[0]?.timestamp ?? '',
          ).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}
