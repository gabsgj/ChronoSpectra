import { extent, scaleLinear, scaleTime } from 'd3'
import { useMemo, useRef, useState } from 'react'

import type { LivePredictionPoint, ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { getSvgCoordinates } from './getSvgCoordinates'

interface ProjectedPredictionPoint {
  predicted: number
  prediction_horizon_days?: number | null
  prediction_target_at: string
  prediction_mode: string
  reference_actual: number
}

interface PredictionOverlayChartProps {
  points: LivePredictionPoint[]
  theme: ThemeMode
  projectedPoint?: ProjectedPredictionPoint | null
  chartHeightClass?: string
}

interface OverlayPoint {
  actual: number | null
  predicted: number
  prediction_horizon_days?: number | null
  prediction_mode: string
  prediction_target_at?: string | null
  projected: boolean
  spread: number | null
  timestamp: string
  timestampMs: number
}

interface ForecastBridgePoint {
  predicted: number
  timestampMs: number
}

const CHART_WIDTH = 860
const CHART_HEIGHT = 340
const PADDING_X = 30
const PADDING_Y = 24
const FALLBACK_END_TIMESTAMP = 86_400_000

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

const buildPath = (
  points: OverlayPoint[],
  valueAccessor: (point: OverlayPoint) => number | null,
  xScale: ReturnType<typeof scaleTime>,
  yScale: ReturnType<typeof scaleLinear>,
) => {
  const drawablePoints = points
    .map((point) => {
      const value = valueAccessor(point)
      if (value === null) {
        return null
      }
      return {
        x: Number(xScale(new Date(point.timestampMs))),
        y: Number(yScale(value)),
      }
    })
    .filter((point): point is { x: number; y: number } => point !== null)

  if (drawablePoints.length === 0) {
    return ''
  }

  return drawablePoints
    .map((point, index) => {
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    })
    .join(' ')
}

const buildBandPath = (
  points: OverlayPoint[],
  xScale: ReturnType<typeof scaleTime>,
  yScale: ReturnType<typeof scaleLinear>,
) => {
  const actualPoints = points
    .filter((point) => point.actual !== null)
    .map((point) => ({
      x: Number(xScale(new Date(point.timestampMs))),
      y: Number(yScale(point.actual ?? 0)),
    }))
  const predictedPoints = points
    .filter((point) => point.actual !== null)
    .map((point) => ({
      x: Number(xScale(new Date(point.timestampMs))),
      y: Number(yScale(point.predicted)),
    }))

  if (actualPoints.length === 0 || predictedPoints.length === 0) {
    return ''
  }

  const actualPath = actualPoints
    .map((point, index) => {
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    })
    .join(' ')
  const predictedPath = [...predictedPoints]
    .reverse()
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')

  return `${actualPath} ${predictedPath} Z`
}

const buildForecastBridgeBandPath = (
  startTimestampMs: number,
  referenceValue: number,
  endTimestampMs: number,
  projectedValue: number,
  xScale: ReturnType<typeof scaleTime>,
  yScale: ReturnType<typeof scaleLinear>,
) => {
  const startX = Number(xScale(new Date(startTimestampMs)))
  const endX = Number(xScale(new Date(endTimestampMs)))
  const referenceY = Number(yScale(referenceValue))
  const projectedY = Number(yScale(projectedValue))

  return [
    `M ${startX.toFixed(2)} ${referenceY.toFixed(2)}`,
    `L ${endX.toFixed(2)} ${projectedY.toFixed(2)}`,
    `L ${endX.toFixed(2)} ${referenceY.toFixed(2)}`,
    'Z',
  ].join(' ')
}

const buildForecastBridgePath = (
  points: ForecastBridgePoint[],
  xScale: ReturnType<typeof scaleTime>,
  yScale: ReturnType<typeof scaleLinear>,
) => {
  if (points.length === 0) {
    return ''
  }

  return points
    .map((point, index) => {
      const x = Number(xScale(new Date(point.timestampMs)))
      const y = Number(yScale(point.predicted))
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export const PredictionOverlayChart = ({
  points,
  theme,
  projectedPoint,
  chartHeightClass = 'h-[22rem]',
}: PredictionOverlayChartProps) => {
  const colors = getChartColors(theme)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredTimestampMs, setHoveredTimestampMs] = useState<number | null>(null)
  const overlayPoints = useMemo<OverlayPoint[]>(() => {
    const historyPoints = points
      .map<OverlayPoint | null>((point) => {
        const timestampMs = new Date(point.timestamp).getTime()
        if (!Number.isFinite(timestampMs)) {
          return null
        }
        return {
          actual: point.actual,
          predicted: point.predicted,
          prediction_horizon_days: point.prediction_horizon_days,
          prediction_mode: point.prediction_mode,
          prediction_target_at: point.prediction_target_at ?? null,
          projected: false,
          spread: point.spread,
          timestamp: point.timestamp,
          timestampMs,
        }
      })
      .filter((point): point is OverlayPoint => point !== null)

    if (!projectedPoint) {
      return historyPoints
    }

    const targetTimestampMs = new Date(projectedPoint.prediction_target_at).getTime()
    if (!Number.isFinite(targetTimestampMs)) {
      return historyPoints
    }

    return [
      ...historyPoints,
      {
        actual: null,
        predicted: projectedPoint.predicted,
        prediction_horizon_days: projectedPoint.prediction_horizon_days ?? null,
        prediction_mode: projectedPoint.prediction_mode,
        prediction_target_at: projectedPoint.prediction_target_at,
        projected: true,
        spread: projectedPoint.predicted - projectedPoint.reference_actual,
        timestamp: projectedPoint.prediction_target_at,
        timestampMs: targetTimestampMs,
      },
    ].sort((leftPoint, rightPoint) => leftPoint.timestampMs - rightPoint.timestampMs)
  }, [points, projectedPoint])
  const hasPoints = overlayPoints.length > 0
  const actualValues = overlayPoints
    .map((point) => point.actual)
    .filter((value): value is number => typeof value === 'number')
  const predictedValues = overlayPoints.map((point) => point.predicted)
  const allValues = [...actualValues, ...predictedValues]
  const [minTimestamp, maxTimestamp] = extent(overlayPoints, (point) => point.timestampMs)
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1
  const xScale = scaleTime()
    .domain([
      new Date(minTimestamp ?? 0),
      new Date(maxTimestamp ?? FALLBACK_END_TIMESTAMP),
    ])
    .range([PADDING_X, CHART_WIDTH - PADDING_X])
  const yScale = scaleLinear()
    .domain([
      minValue - Math.max((maxValue - minValue) * 0.08, 4),
      maxValue + Math.max((maxValue - minValue) * 0.08, 4),
    ])
    .range([CHART_HEIGHT - PADDING_Y, PADDING_Y])
  const actualPath = buildPath(overlayPoints, (point) => point.actual, xScale, yScale)
  const latestActualPoint = [...overlayPoints]
    .reverse()
    .find((point) => point.actual !== null)
  const projectedForecastPoint =
    [...overlayPoints].reverse().find((point) => point.projected) ?? null
  const hasProjectedBridge = Boolean(
    latestActualPoint &&
      projectedForecastPoint &&
      projectedForecastPoint.timestampMs > latestActualPoint.timestampMs,
  )
  const forecastBridgePoints =
    hasProjectedBridge && latestActualPoint && projectedForecastPoint
      ? [
          {
            predicted: latestActualPoint.actual ?? latestActualPoint.predicted,
            timestampMs: latestActualPoint.timestampMs,
          },
          {
            predicted: projectedForecastPoint.predicted,
            timestampMs: projectedForecastPoint.timestampMs,
          },
        ]
      : []
  const predictedPath = hasProjectedBridge
    ? buildForecastBridgePath(forecastBridgePoints, xScale, yScale)
    : buildPath(overlayPoints, (point) => point.predicted, xScale, yScale)
  const bandPath =
    hasProjectedBridge && latestActualPoint && projectedForecastPoint
      ? buildForecastBridgeBandPath(
          latestActualPoint.timestampMs,
          latestActualPoint.actual ?? latestActualPoint.predicted,
          projectedForecastPoint.timestampMs,
          projectedForecastPoint.predicted,
          xScale,
          yScale,
        )
      : buildBandPath(overlayPoints, xScale, yScale)
  const hoveredPoint = hoveredTimestampMs
    ? overlayPoints.reduce((closestPoint, candidate) => {
        return Math.abs(candidate.timestampMs - hoveredTimestampMs) <
          Math.abs(closestPoint.timestampMs - hoveredTimestampMs)
          ? candidate
          : closestPoint
      }, overlayPoints[0])
    : null

  const updateHover = (clientX: number) => {
    const coordinates = getSvgCoordinates(svgRef.current, clientX, 0)
    if (!coordinates || overlayPoints.length === 0) {
      return
    }

    const clampedChartX = Math.min(
      Math.max(coordinates.x, PADDING_X),
      CHART_WIDTH - PADDING_X,
    )
    const hoveredDate = xScale.invert(clampedChartX)
    setHoveredTimestampMs(hoveredDate.getTime())
  }

  if (!hasPoints) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-[22px] border border-dashed border-stroke/70 text-sm text-muted">
        No overlay points are available yet.
      </div>
    )
  }

  return (
    <div className="relative space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-3xl font-semibold text-ink">
            {formatCurrency(latestActualPoint?.actual ?? 0)}
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Latest actual close
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-2xl font-semibold text-ink">
            {formatCurrency(overlayPoints.at(-1)?.predicted ?? 0)}
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Latest forecast
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
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber/20" />
          Spread band
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Prediction overlay chart"
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
        {bandPath ? <path d={bandPath} fill={colors.amberFill} opacity="0.45" /> : null}
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
        {latestActualPoint ? (
          <circle
            cx={xScale(new Date(latestActualPoint.timestampMs))}
            cy={yScale(latestActualPoint.actual ?? latestActualPoint.predicted)}
            r="4.5"
            fill={colors.surface}
            stroke={colors.tealLine}
            strokeWidth="2.5"
          />
        ) : null}
        {projectedForecastPoint ? (
          <circle
            cx={xScale(new Date(projectedForecastPoint.timestampMs))}
            cy={yScale(projectedForecastPoint.predicted)}
            r="5.5"
            fill={colors.surface}
            stroke={colors.amberLine}
            strokeWidth="2.5"
          />
        ) : null}
        {projectedPoint && latestActualPoint ? (
          <rect
            x={xScale(new Date(latestActualPoint.timestampMs))}
            y={PADDING_Y}
            width={
              xScale(
                new Date(
                  overlayPoints.at(-1)?.timestampMs ?? latestActualPoint.timestampMs,
                ),
              ) - xScale(new Date(latestActualPoint.timestampMs))
            }
            height={CHART_HEIGHT - PADDING_Y * 2}
            fill={colors.amberFill}
            opacity="0.12"
          />
        ) : null}
        {hoveredPoint ? (
          <>
            <line
              x1={xScale(new Date(hoveredPoint.timestampMs))}
              x2={xScale(new Date(hoveredPoint.timestampMs))}
              y1={PADDING_Y}
              y2={CHART_HEIGHT - PADDING_Y}
              stroke={colors.axis}
              strokeDasharray="5 6"
            />
            {hoveredPoint.actual !== null ? (
              <circle
                cx={xScale(new Date(hoveredPoint.timestampMs))}
                cy={yScale(hoveredPoint.actual)}
                r="5"
                fill={colors.surface}
                stroke={colors.tealLine}
                strokeWidth="2.5"
              />
            ) : null}
            {!hasProjectedBridge || hoveredPoint.projected ? (
              <circle
                cx={xScale(new Date(hoveredPoint.timestampMs))}
                cy={yScale(hoveredPoint.predicted)}
                r={hoveredPoint.projected ? 7 : 5}
                fill={colors.surface}
                stroke={colors.amberLine}
                strokeWidth="2.5"
              />
            ) : null}
          </>
        ) : null}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute z-10 w-64 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((xScale(new Date(hoveredPoint.timestampMs)) / CHART_WIDTH) * 100).toFixed(2)}% - 7rem), calc(100% - 16rem))`,
            top: '6rem',
          }}
        >
          <p className="font-semibold">
            {new Date(hoveredPoint.timestamp).toLocaleString()}
          </p>
          <div className="mt-2 space-y-1 text-muted">
            {hoveredPoint.projected ? (
              <>
                <p>Projected forecast: {formatCurrency(hoveredPoint.predicted)}</p>
                {latestActualPoint?.actual != null ? (
                  <>
                    <p>
                      Latest actual reference:{' '}
                      {formatCurrency(latestActualPoint?.actual ?? 0)}
                    </p>
                    <p>
                      Forecast spread:{' '}
                      {formatCurrency(
                        hoveredPoint.predicted - (latestActualPoint?.actual ?? 0),
                      )}
                    </p>
                  </>
                ) : null}
              </>
            ) : hoveredPoint.actual !== null ? (
              <>
                <p>Actual: {formatCurrency(hoveredPoint.actual)}</p>
                {!hasProjectedBridge ? (
                  <>
                    <p>Predicted: {formatCurrency(hoveredPoint.predicted)}</p>
                    {hoveredPoint.spread !== null ? (
                      <p>Spread: {formatCurrency(hoveredPoint.spread)}</p>
                    ) : null}
                  </>
                ) : latestActualPoint &&
                  hoveredPoint.timestampMs === latestActualPoint.timestampMs &&
                  projectedForecastPoint ? (
                  <>
                    <p>Predicted: {formatCurrency(hoveredPoint.predicted)}</p>
                    <p>
                      Forecast target:{' '}
                      {formatCurrency(projectedForecastPoint.predicted)}
                    </p>
                    <p>
                      Forecast spread:{' '}
                      {formatCurrency(
                        projectedForecastPoint.predicted -
                          (latestActualPoint.actual ?? 0),
                      )}
                    </p>
                  </>
                ) : (
                  <p>
                    Earlier session point. The visible dashed forecast bridge
                    starts from the latest actual close.
                  </p>
                )}
              </>
            ) : (
              <p>Projected forecast target. No actual market close exists yet.</p>
            )}
            {hoveredPoint.prediction_horizon_days ? (
              <p>Horizon: {hoveredPoint.prediction_horizon_days} trading days</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{new Date(overlayPoints[0]?.timestamp ?? '').toLocaleString()}</span>
        <span>
          {new Date(
            overlayPoints.at(-1)?.timestamp ?? overlayPoints[0]?.timestamp ?? '',
          ).toLocaleString()}
        </span>
      </div>
    </div>
  )
}
