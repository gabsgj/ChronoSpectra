import { max, scaleBand, scaleLinear } from 'd3'
import { useMemo, useRef, useState } from 'react'

import type { ModelVariantResponse, ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { TrackChartCard } from './TrackChartCard'

type MetricKey = 'mse' | 'rmse' | 'mae' | 'mape'

interface MetricDefinition {
  detail: string
  explanation: string
  key: MetricKey
  label: string
  suffix?: string
}

interface ModelComparisonChartProps {
  variants: ModelVariantResponse[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'mse',
    label: 'MSE',
    detail: 'Mean squared error. Lower is better.',
    explanation:
      'Squares each error before averaging, so big misses get penalized heavily.',
  },
  {
    key: 'rmse',
    label: 'RMSE',
    detail: 'Root mean squared error. Lower is better.',
    explanation:
      'The square root of MSE, which puts the error back on the price scale.',
  },
  {
    key: 'mae',
    label: 'MAE',
    detail: 'Mean absolute error. Lower is better.',
    explanation:
      'Average absolute miss size with less penalty on outliers than MSE.',
  },
  {
    key: 'mape',
    label: 'MAPE',
    detail: 'Mean absolute percentage error. Lower is better.',
    explanation:
      'Average percentage miss size, which helps compare across different price levels.',
    suffix: '%',
  },
]

const CHART_WIDTH = 720
const CHART_HEIGHT = 320
const PADDING = { top: 20, right: 24, bottom: 52, left: 60 }

const formatValue = (value: number, suffix = '') => {
  return `${value.toFixed(value >= 100 ? 1 : 2)}${suffix}`
}

interface MetricBarDatum {
  mode: ModelVariantResponse['mode']
  value: number
}

interface ModelComparisonPlotProps {
  chartData: MetricBarDatum[]
  selectedMetric: MetricDefinition
  theme: ThemeMode
  chartHeightClass?: string
}

const ModelComparisonPlot = ({
  chartData,
  selectedMetric,
  theme,
  chartHeightClass = 'h-[22rem]',
}: ModelComparisonPlotProps) => {
  const colors = getChartColors(theme)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const drawableWidth = CHART_WIDTH - PADDING.left - PADDING.right
  const drawableHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const maxValue = max(chartData, (item) => item.value) ?? 1
  const xScale = scaleBand<string>()
    .domain(chartData.map((item) => item.mode))
    .range([PADDING.left, PADDING.left + drawableWidth])
    .padding(0.25)
  const yScale = scaleLinear()
    .domain([0, maxValue * 1.08 || 1])
    .range([PADDING.top + drawableHeight, PADDING.top])
  const hoveredDatum =
    hoveredIndex !== null ? chartData[hoveredIndex] ?? null : null

  const updateHover = (clientX: number) => {
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (!bounds || chartData.length === 0) {
      return
    }

    const relativeX = Math.min(Math.max(clientX - bounds.left, 0), bounds.width)
    const ratio = relativeX / Math.max(bounds.width, 1)
    setHoveredIndex(Math.round(ratio * Math.max(chartData.length - 1, 0)))
  }

  return (
    <div ref={wrapperRef} className="relative space-y-4">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Model comparison chart"
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
                x2={PADDING.left + drawableWidth}
                y1={y}
                y2={y}
                stroke={colors.grid}
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 10}
                y={y + 4}
                fill={colors.axis}
                fontSize="11"
                textAnchor="end"
              >
                {formatValue(maxValue * offset, selectedMetric.suffix)}
              </text>
            </g>
          )
        })}

        {chartData.map((item, index) => {
          const barWidth = xScale.bandwidth()
          const x = xScale(item.mode) ?? PADDING.left
          const y = yScale(item.value)
          const height = PADDING.top + drawableHeight - y
          const fill = index % 2 === 0 ? colors.bar : colors.barAlt

          return (
            <g key={item.mode}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx="14"
                fill={fill}
                opacity={hoveredIndex === index ? 1 : 0.9}
              />
              <text
                x={x + barWidth / 2}
                y={CHART_HEIGHT - 18}
                fill={colors.axis}
                fontSize="11"
                textAnchor="middle"
              >
                {item.mode.replaceAll('_', ' ')}
              </text>
            </g>
          )
        })}
      </svg>

      {hoveredDatum ? (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((((hoveredIndex ?? 0) + 0.5) / Math.max(chartData.length, 1)) * 100).toFixed(2)}% - 6rem), calc(100% - 15rem))`,
            top: '3.5rem',
          }}
        >
          <p className="font-semibold">
            {hoveredDatum.mode.replaceAll('_', ' ')}
          </p>
          <div className="mt-2 space-y-1 text-muted">
            <p>
              {selectedMetric.label}: {formatValue(hoveredDatum.value, selectedMetric.suffix)}
            </p>
            <p>{selectedMetric.detail}</p>
            <p>{selectedMetric.explanation}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const ModelComparisonChart = ({
  variants,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: ModelComparisonChartProps) => {
  const [selectedMetricKey, setSelectedMetricKey] = useState<MetricKey>('mse')
  const selectedMetric =
    METRIC_DEFINITIONS.find((metric) => metric.key === selectedMetricKey) ??
    METRIC_DEFINITIONS[0]
  const chartData = useMemo<MetricBarDatum[]>(() => {
    const nextData: MetricBarDatum[] = []
    variants.forEach((variant) => {
      const value = variant.metrics?.[selectedMetric.key]
      if (typeof value === 'number') {
        nextData.push({
          mode: variant.mode,
          value,
        })
      }
    })
    return nextData
  }, [selectedMetric.key, variants])
  const exportRows = useMemo(() => {
    return variants.map((variant) => ({
      available: variant.available,
      mae: variant.metrics?.mae,
      mape: variant.metrics?.mape,
      mode: variant.mode,
      mse: variant.metrics?.mse,
      rmse: variant.metrics?.rmse,
    }))
  }, [variants])

  return (
    <TrackChartCard
      title="Model Comparison Chart"
      detail="Switch between the core error metrics to compare saved model variants side by side. Hover a bar for a plain-language explanation of the active metric."
      loading={loading}
      empty={chartData.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="model-comparison"
      exportRows={exportRows}
      exportJson={{ selected_metric: selectedMetric.key, variants }}
      expandedChildren={
        <ModelComparisonPlot
          chartData={chartData}
          selectedMetric={selectedMetric}
          theme={theme}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>
            Active metric: {selectedMetric.label} | {selectedMetric.detail}
          </p>
          <p>{chartData.length} model variants with saved metrics</p>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {METRIC_DEFINITIONS.map((metric) => {
            const isActive = metric.key === selectedMetricKey
            return (
              <button
                key={metric.key}
                type="button"
                onClick={() => setSelectedMetricKey(metric.key)}
                className={[
                  'rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition',
                  isActive
                    ? 'border-teal bg-teal/12 text-teal'
                    : 'border-stroke/70 bg-card/70 text-muted hover:border-teal/35 hover:text-teal',
                ].join(' ')}
              >
                {metric.label}
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {METRIC_DEFINITIONS.map((metric) => (
            <div
              key={`${metric.key}-definition`}
              className="rounded-[18px] border border-stroke/70 bg-card/70 p-4"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {metric.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {metric.detail}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {metric.explanation}
              </p>
            </div>
          ))}
        </div>

        <ModelComparisonPlot
          chartData={chartData}
          selectedMetric={selectedMetric}
          theme={theme}
        />
      </div>
    </TrackChartCard>
  )
}
