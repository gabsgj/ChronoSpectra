import { useRef, useState } from 'react'

import type { ThemeMode, TrackPoint } from '../../types'
import { getChartColors } from './getChartColors'
import { getSvgCoordinates } from './getSvgCoordinates'

interface BarTrackChartProps {
  points: TrackPoint[]
  theme: ThemeMode
  tone: 'teal' | 'amber'
  formatValue: (value: number) => string
  chartHeightClass?: string
}

const CHART_WIDTH = 760
const CHART_HEIGHT = 320
const BAR_GAP = 10
const BAR_PADDING = 28

export const BarTrackChart = ({
  points,
  theme,
  tone,
  formatValue,
  chartHeightClass = 'h-[21rem]',
}: BarTrackChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const colors = getChartColors(theme)
  const values = points.map((point) => point.value)
  const maxValue = Math.max(...values, 0)
  const latestValue = points.at(-1)?.value ?? 0
  const barColor = tone === 'teal' ? colors.bar : colors.barAlt
  const drawableWidth = CHART_WIDTH - BAR_PADDING * 2
  const barWidth =
    (drawableWidth - Math.max(points.length - 1, 0) * BAR_GAP) /
    Math.max(points.length, 1)
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null

  const findNearestBarIndex = (chartX: number) => {
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    points.forEach((_, index) => {
      const centerX = BAR_PADDING + index * (barWidth + BAR_GAP) + Math.max(barWidth, 14) / 2
      const distance = Math.abs(centerX - chartX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    return nearestIndex
  }

  const updateHover = (clientX: number) => {
    const coordinates = getSvgCoordinates(svgRef.current, clientX, 0)
    if (!coordinates) {
      return
    }

    const clampedChartX = Math.min(
      Math.max(coordinates.x, BAR_PADDING),
      CHART_WIDTH - BAR_PADDING,
    )
    setHoveredIndex(findNearestBarIndex(clampedChartX))
  }

  return (
    <div className="relative space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-ink lg:text-4xl">
            {formatValue(latestValue)}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
            Latest reported value
          </p>
        </div>
        <p className="text-xs text-muted">
          {points.length} reported periods
        </p>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Bar chart"
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
        {points.map((point, index) => {
          const normalizedHeight =
            maxValue === 0 ? 0 : (point.value / maxValue) * (CHART_HEIGHT - 70)
          const x = BAR_PADDING + index * (barWidth + BAR_GAP)
          const y = CHART_HEIGHT - 30 - normalizedHeight
          return (
            <g key={point.timestamp}>
              <rect
                x={x}
                y={y}
                width={Math.max(barWidth, 14)}
                height={normalizedHeight}
                rx="10"
                fill={barColor}
                opacity={hoveredIndex === index ? 1 : 0.86}
              />
            </g>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute top-[6.25rem] z-10 w-44 rounded-[18px] border border-stroke/70 bg-card/95 px-3 py-2 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((((hoveredIndex ?? 0) + 0.5) / Math.max(points.length, 1)) * 100).toFixed(2)}% - 5.5rem), calc(100% - 12rem))`,
          }}
        >
          <p className="font-semibold">
            {new Date(hoveredPoint.timestamp).toLocaleDateString()}
          </p>
          <p className="mt-1 text-muted">
            Value: {formatValue(hoveredPoint.value)}
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
