import { lineRadial, max, scaleLinear } from 'd3'
import { useMemo, useState } from 'react'

import type { ModelVariantResponse, ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { TrackChartCard } from './TrackChartCard'

interface RadarMetricsChartProps {
  variants: ModelVariantResponse[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

interface MetricAxis {
  definition: string
  key: 'mse' | 'rmse' | 'mae' | 'mape' | 'directional_accuracy'
  label: string
  invert: boolean
}

interface NormalizedVariant {
  mode: string
  rawValues: number[]
  values: number[]
}

const AXES: MetricAxis[] = [
  {
    key: 'mse',
    label: 'MSE',
    invert: true,
    definition: 'Mean squared error. Wider is better here because lower error maps outward.',
  },
  {
    key: 'rmse',
    label: 'RMSE',
    invert: true,
    definition: 'Root mean squared error. It stays on the original price scale.',
  },
  {
    key: 'mae',
    label: 'MAE',
    invert: true,
    definition: 'Mean absolute error. Less sensitive to outliers than MSE.',
  },
  {
    key: 'mape',
    label: 'MAPE',
    invert: true,
    definition: 'Mean absolute percentage error. Lower percentage error expands outward.',
  },
  {
    key: 'directional_accuracy',
    label: 'Direction',
    invert: false,
    definition: 'Share of times the model got the up/down direction correct. Higher expands outward.',
  },
]

const CHART_SIZE = 400
const CENTER = CHART_SIZE / 2
const OUTER_RADIUS = 126

const polarToCartesian = (angle: number, radius: number) => ({
  x: CENTER + Math.cos(angle) * radius,
  y: CENTER + Math.sin(angle) * radius,
})

const clamp = (value: number) => Math.max(0.06, Math.min(value, 1))

interface HoveredPoint {
  axis: MetricAxis
  mode: string
  normalizedValue: number
  rawValue: number
  x: number
  y: number
}

interface RadarMetricsPlotProps {
  normalizedVariants: NormalizedVariant[]
  theme: ThemeMode
  chartSizeClass?: string
}

const RadarMetricsPlot = ({
  normalizedVariants,
  theme,
  chartSizeClass = 'h-[24rem] max-w-[24rem]',
}: RadarMetricsPlotProps) => {
  const colors = getChartColors(theme)
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null)
  const radiusScale = scaleLinear().domain([0, 1]).range([18, OUTER_RADIUS])
  const polygonLine = lineRadial<number>()
    .radius((value) => radiusScale(value))
    .angle((_, index) => (Math.PI * 2 * index) / AXES.length - Math.PI / 2)

  return (
    <div className="relative flex justify-center">
      <svg
        viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
        className={`${chartSizeClass} w-full shrink-0`}
        role="img"
        aria-label="Radar chart of normalized model metrics"
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <rect
          x="0"
          y="0"
          width={CHART_SIZE}
          height={CHART_SIZE}
          rx="28"
          fill={colors.surface}
        />
        {[0.25, 0.5, 0.75, 1].map((step) => {
          const points = AXES.map((_, index) => {
            const angle = (Math.PI * 2 * index) / AXES.length - Math.PI / 2
            return polarToCartesian(angle, radiusScale(step))
          })
          return (
            <polygon
              key={step}
              points={points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={colors.grid}
              strokeWidth="1"
            />
          )
        })}

        {AXES.map((axis, index) => {
          const angle = (Math.PI * 2 * index) / AXES.length - Math.PI / 2
          const point = polarToCartesian(angle, OUTER_RADIUS + 24)
          return (
            <g key={axis.key}>
              <line
                x1={CENTER}
                x2={point.x}
                y1={CENTER}
                y2={point.y}
                stroke={colors.grid}
                strokeWidth="1"
              />
              <text
                x={point.x}
                y={point.y}
                fill={colors.axis}
                fontSize="11"
                textAnchor="middle"
              >
                {axis.label}
              </text>
            </g>
          )
        })}

        {normalizedVariants.map((variant, index) => {
          const stroke = index % 2 === 0 ? colors.tealLine : colors.amberLine
          const fill = index % 2 === 0 ? colors.tealFill : colors.amberFill
          const path = polygonLine([...variant.values, variant.values[0]]) ?? ''
          return (
            <g key={variant.mode}>
              <path
                d={path}
                transform={`translate(${CENTER}, ${CENTER})`}
                fill={fill}
                stroke={stroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              {variant.values.map((value, axisIndex) => {
                const angle =
                  (Math.PI * 2 * axisIndex) / AXES.length - Math.PI / 2
                const point = polarToCartesian(angle, radiusScale(value))
                return (
                  <circle
                    key={`${variant.mode}-${AXES[axisIndex].key}`}
                    cx={point.x}
                    cy={point.y}
                    r="5"
                    fill={colors.surface}
                    stroke={stroke}
                    strokeWidth="2.5"
                    onMouseEnter={() =>
                      setHoveredPoint({
                        axis: AXES[axisIndex],
                        mode: variant.mode,
                        normalizedValue: value,
                        rawValue: variant.rawValues[axisIndex] ?? 0,
                        x: point.x,
                        y: point.y,
                      })
                    }
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((hoveredPoint.x / CHART_SIZE) * 100).toFixed(2)}% - 7rem), calc(100% - 15rem))`,
            top: `clamp(0.75rem, calc(${((hoveredPoint.y / CHART_SIZE) * 100).toFixed(2)}% - 3rem), calc(100% - 8rem))`,
          }}
        >
          <p className="font-semibold">
            {hoveredPoint.mode.replaceAll('_', ' ')} | {hoveredPoint.axis.label}
          </p>
          <div className="mt-2 space-y-1 text-muted">
            <p>Raw value: {hoveredPoint.rawValue.toFixed(4)}</p>
            <p>Normalized score: {hoveredPoint.normalizedValue.toFixed(3)}</p>
            <p>{hoveredPoint.axis.definition}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const RadarMetricsChart = ({
  variants,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: RadarMetricsChartProps) => {
  const colors = getChartColors(theme)
  const normalizedVariants = useMemo<NormalizedVariant[]>(() => {
    const availableVariants = variants.filter((variant) => variant.metrics !== null)
    const nextVariants: NormalizedVariant[] = []
    availableVariants.forEach((variant) => {
      const values: number[] = []
      const rawValues: number[] = []
      let isComplete = true
      AXES.forEach((axis) => {
        const axisValues = availableVariants
          .map((candidate) => candidate.metrics?.[axis.key] ?? null)
          .filter((value): value is number => typeof value === 'number')
        const axisMax = max(axisValues) ?? 1
        const rawValue = variant.metrics?.[axis.key]
        if (typeof rawValue !== 'number') {
          isComplete = false
          return
        }
        rawValues.push(rawValue)
        if (axis.invert) {
          values.push(axisMax === 0 ? 1 : clamp(1 - rawValue / axisMax))
          return
        }
        values.push(axisMax === 0 ? 0 : clamp(rawValue / axisMax))
      })
      if (isComplete) {
        nextVariants.push({
          mode: variant.mode,
          rawValues,
          values,
        })
      }
    })
    return nextVariants
  }, [variants])
  const exportRows = useMemo(() => {
    return variants.map((variant) => ({
      directional_accuracy: variant.metrics?.directional_accuracy,
      mae: variant.metrics?.mae,
      mape: variant.metrics?.mape,
      mode: variant.mode,
      mse: variant.metrics?.mse,
      rmse: variant.metrics?.rmse,
    }))
  }, [variants])

  return (
    <TrackChartCard
      title="Radar / Spider Chart"
      detail="Each spoke is normalized so better-performing models expand outward. Error metrics invert their scale, while directional accuracy expands normally."
      loading={loading}
      empty={normalizedVariants.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="radar-metrics"
      exportRows={exportRows}
      exportJson={{ axes: AXES, variants }}
      expandedChildren={
        <RadarMetricsPlot
          normalizedVariants={normalizedVariants}
          theme={theme}
          chartSizeClass="h-[28rem] max-w-[28rem]"
        />
      }
      footer={
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {normalizedVariants.map((variant, index) => (
            <span key={variant.mode} className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor:
                    index % 2 === 0 ? colors.tealLine : colors.amberLine,
                }}
              />
              {variant.mode.replaceAll('_', ' ')}
            </span>
          ))}
        </div>
      }
    >
      <div className="space-y-5">
        <RadarMetricsPlot normalizedVariants={normalizedVariants} theme={theme} />

        <div className="grid gap-3 md:grid-cols-2">
          {AXES.map((axis) => (
            <div
              key={axis.key}
              className="rounded-[18px] border border-stroke/70 bg-card/70 p-4"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {axis.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {axis.definition}
              </p>
            </div>
          ))}
        </div>
      </div>
    </TrackChartCard>
  )
}
