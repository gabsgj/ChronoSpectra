import { format, max, scaleLinear } from 'd3'
import { useMemo, useRef, useState } from 'react'

import type { ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { TrackChartCard } from './TrackChartCard'

interface FrequencySpectrumChartProps {
  frequency: number[]
  amplitude: number[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

interface SpectrumBucket {
  amplitude: number
  frequencyEnd: number
  frequencyMidpoint: number
  frequencyStart: number
}

const CHART_WIDTH = 840
const CHART_HEIGHT = 360
const MARGINS = {
  top: 28,
  right: 20,
  bottom: 48,
  left: 58,
}
const MAX_BUCKETS = 72
const zoneFormat = format('.2f')

const annotationZones = [
  {
    accent: 'rgba(0, 191, 165, 0.08)',
    label: 'Macro trend',
    maxFrequency: 0.03,
  },
  {
    accent: 'rgba(245, 158, 11, 0.10)',
    label: 'Swing rhythm',
    maxFrequency: 0.12,
  },
  {
    accent: 'rgba(120, 144, 179, 0.12)',
    label: 'Short-term noise',
    maxFrequency: Number.POSITIVE_INFINITY,
  },
]

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((total, value) => total + value, 0) / values.length
}

const bucketSpectrum = (frequency: number[], amplitude: number[]) => {
  const pointCount = Math.min(frequency.length, amplitude.length)
  if (pointCount === 0) {
    return []
  }

  const bucketSize = Math.max(1, Math.ceil(pointCount / MAX_BUCKETS))
  const buckets: SpectrumBucket[] = []

  for (let startIndex = 0; startIndex < pointCount; startIndex += bucketSize) {
    const endIndex = Math.min(startIndex + bucketSize, pointCount)
    const frequencySlice = frequency.slice(startIndex, endIndex)
    const amplitudeSlice = amplitude.slice(startIndex, endIndex)

    buckets.push({
      amplitude: average(amplitudeSlice),
      frequencyEnd: frequencySlice.at(-1) ?? frequencySlice[0] ?? 0,
      frequencyMidpoint: average(frequencySlice),
      frequencyStart: frequencySlice[0] ?? 0,
    })
  }

  return buckets
}

const formatCycleLength = (frequencyValue: number) => {
  if (frequencyValue <= 0) {
    return 'Longer than the sampled window'
  }
  const days = 1 / frequencyValue
  if (!Number.isFinite(days) || days > 365) {
    return 'Long regime cycle'
  }
  if (days >= 30) {
    return `${days.toFixed(0)} trading days`
  }
  return `${days.toFixed(1)} trading days`
}

interface FrequencySpectrumPlotProps {
  buckets: SpectrumBucket[]
  theme: ThemeMode
  chartHeightClass?: string
}

const FrequencySpectrumPlot = ({
  buckets,
  theme,
  chartHeightClass = 'h-[25rem]',
}: FrequencySpectrumPlotProps) => {
  const colors = getChartColors(theme)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const plotWidth = CHART_WIDTH - MARGINS.left - MARGINS.right
  const plotHeight = CHART_HEIGHT - MARGINS.top - MARGINS.bottom
  const maxFrequency = buckets.at(-1)?.frequencyEnd ?? 1
  const maxAmplitude = max(buckets.map((bucket) => bucket.amplitude)) ?? 1
  const xScale = scaleLinear()
    .domain([0, maxFrequency || 1])
    .range([MARGINS.left, CHART_WIDTH - MARGINS.right])
  const yScale = scaleLinear()
    .domain([0, maxAmplitude || 1])
    .range([CHART_HEIGHT - MARGINS.bottom, MARGINS.top])
  const hoveredBucket =
    hoveredIndex !== null ? buckets[hoveredIndex] ?? null : null
  const tickFormatter = format('.2f')

  const updateHover = (clientX: number) => {
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (!bounds || buckets.length === 0) {
      return
    }

    const relativeX = Math.min(Math.max(clientX - bounds.left, 0), bounds.width)
    const ratio = relativeX / Math.max(bounds.width, 1)
    setHoveredIndex(Math.round(ratio * Math.max(buckets.length - 1, 0)))
  }

  return (
    <div ref={wrapperRef} className="relative space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {annotationZones.map((zone, index) => {
          const zoneStart = index === 0 ? 0 : annotationZones[index - 1].maxFrequency
          const zoneEnd = Math.min(zone.maxFrequency, maxFrequency)
          return (
            <div
              key={zone.label}
              className="rounded-[18px] border border-stroke/60 px-4 py-3"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {zone.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {zoneFormat(zoneStart)} to{' '}
                {zone.maxFrequency === Number.POSITIVE_INFINITY
                  ? `${zoneFormat(maxFrequency)} cycles/day`
                  : `${zoneFormat(zoneEnd)} cycles/day`}
              </p>
            </div>
          )
        })}
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Frequency spectrum bar chart"
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
        {annotationZones.map((zone, index) => {
          const zoneStart = index === 0 ? 0 : annotationZones[index - 1].maxFrequency
          const zoneEnd =
            zone.maxFrequency === Number.POSITIVE_INFINITY
              ? maxFrequency
              : Math.min(zone.maxFrequency, maxFrequency)
          const zoneWidth = Math.max(xScale(zoneEnd) - xScale(zoneStart), 0)

          return (
            <g key={zone.label}>
              <rect
                x={xScale(zoneStart)}
                y={MARGINS.top}
                width={zoneWidth}
                height={plotHeight}
                fill={zone.accent}
              />
              <text
                x={xScale(zoneStart) + 8}
                y={MARGINS.top + 16}
                fill={colors.axis}
                fontSize="10"
                letterSpacing="0.16em"
              >
                {zone.label}
              </text>
            </g>
          )
        })}
        {yScale.ticks(4).map((tick) => (
          <g key={tick}>
            <line
              x1={MARGINS.left}
              x2={CHART_WIDTH - MARGINS.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke={colors.grid}
              strokeWidth="1"
            />
            <text
              x={MARGINS.left - 8}
              y={yScale(tick) + 4}
              fill={colors.axis}
              fontSize="11"
              textAnchor="end"
            >
              {tickFormatter(tick)}
            </text>
          </g>
        ))}
        {buckets.map((bucket, index) => {
          const nextBoundary =
            buckets[index + 1]?.frequencyStart ?? bucket.frequencyEnd
          const barWidth = Math.max(
            xScale(nextBoundary) - xScale(bucket.frequencyStart) - 1.5,
            1.5,
          )
          const x = xScale(bucket.frequencyStart)
          const y = yScale(bucket.amplitude)

          return (
            <rect
              key={`${bucket.frequencyStart}-${bucket.frequencyEnd}`}
              x={x}
              y={y}
              width={barWidth}
              height={CHART_HEIGHT - MARGINS.bottom - y}
              rx="1.5"
              fill={colors.bar}
              opacity={hoveredIndex === index ? 1 : 0.88}
            />
          )
        })}
        {hoveredBucket ? (
          <line
            x1={xScale(hoveredBucket.frequencyMidpoint)}
            x2={xScale(hoveredBucket.frequencyMidpoint)}
            y1={MARGINS.top}
            y2={CHART_HEIGHT - MARGINS.bottom}
            stroke={colors.axis}
            strokeDasharray="5 6"
          />
        ) : null}
        <line
          x1={MARGINS.left}
          x2={CHART_WIDTH - MARGINS.right}
          y1={CHART_HEIGHT - MARGINS.bottom}
          y2={CHART_HEIGHT - MARGINS.bottom}
          stroke={colors.axis}
          strokeWidth="1.2"
        />
        <line
          x1={MARGINS.left}
          x2={MARGINS.left}
          y1={MARGINS.top}
          y2={CHART_HEIGHT - MARGINS.bottom}
          stroke={colors.axis}
          strokeWidth="1.2"
        />
        {xScale.ticks(6).map((tick) => (
          <g key={tick}>
            <line
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={CHART_HEIGHT - MARGINS.bottom}
              y2={CHART_HEIGHT - MARGINS.bottom + 6}
              stroke={colors.axis}
              strokeWidth="1"
            />
            <text
              x={xScale(tick)}
              y={CHART_HEIGHT - MARGINS.bottom + 20}
              fill={colors.axis}
              fontSize="11"
              textAnchor="middle"
            >
              {tickFormatter(tick)}
            </text>
          </g>
        ))}
        <text
          x={MARGINS.left + plotWidth / 2}
          y={CHART_HEIGHT - 8}
          fill={colors.axis}
          fontSize="11"
          textAnchor="middle"
        >
          Frequency (cycles/day)
        </text>
        <text
          x={12}
          y={MARGINS.top + plotHeight / 2}
          fill={colors.axis}
          fontSize="11"
          textAnchor="middle"
          transform={`rotate(-90 12 ${MARGINS.top + plotHeight / 2})`}
        >
          Amplitude
        </text>
      </svg>

      {hoveredBucket ? (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((xScale(hoveredBucket.frequencyMidpoint) / CHART_WIDTH) * 100).toFixed(2)}% - 6rem), calc(100% - 15rem))`,
            top: '7rem',
          }}
        >
          <p className="font-semibold">
            {zoneFormat(hoveredBucket.frequencyMidpoint)} cycles/day
          </p>
          <div className="mt-2 space-y-1 text-muted">
            <p>
              Amplitude: {hoveredBucket.amplitude.toFixed(4)}
            </p>
            <p>
              Band: {zoneFormat(hoveredBucket.frequencyStart)} to{' '}
              {zoneFormat(hoveredBucket.frequencyEnd)}
            </p>
            <p>{formatCycleLength(hoveredBucket.frequencyMidpoint)}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const FrequencySpectrumChart = ({
  frequency,
  amplitude,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: FrequencySpectrumChartProps) => {
  const buckets = useMemo(
    () => bucketSpectrum(frequency, amplitude),
    [amplitude, frequency],
  )
  const dominantBucket = useMemo(() => {
    if (buckets.length === 0) {
      return null
    }
    return buckets.reduce((currentBest, bucket) => {
      if (bucket.amplitude > currentBest.amplitude) {
        return bucket
      }
      return currentBest
    }, buckets[0])
  }, [buckets])
  const exportRows = useMemo(() => {
    return frequency.map((frequencyValue, index) => ({
      amplitude: Number((amplitude[index] ?? 0).toFixed(8)),
      frequency: Number(frequencyValue.toFixed(8)),
    }))
  }, [amplitude, frequency])

  return (
    <TrackChartCard
      title="Frequency-Amplitude Spectrum"
      detail="This is the main frequency-domain diagnostic. It condenses the normalized close-price signal into amplitude by frequency so dominant periodic structure stands out before you inspect the heatmap details."
      loading={loading}
      empty={buckets.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="frequency-spectrum"
      exportRows={exportRows}
      exportJson={{ amplitude, buckets, frequency }}
      expandedChildren={
        <FrequencySpectrumPlot
          buckets={buckets}
          theme={theme}
          chartHeightClass="h-[31rem]"
        />
      }
      footer={
        dominantBucket ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
            <span>
              Dominant band near {zoneFormat(dominantBucket.frequencyMidpoint)} cycles/day
            </span>
            <span>{formatCycleLength(dominantBucket.frequencyMidpoint)}</span>
          </div>
        ) : null
      }
    >
      <FrequencySpectrumPlot buckets={buckets} theme={theme} />
    </TrackChartCard>
  )
}
