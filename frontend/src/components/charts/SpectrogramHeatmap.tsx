import {
  extent,
  format,
  interpolateViridis,
  scaleLinear,
  scaleSequential,
} from 'd3'
import {
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'

import type { SpectrogramResponse, ThemeMode } from '../../types'
import { getChartColors } from './getChartColors'
import { TrackChartCard } from './TrackChartCard'

interface SpectrogramHeatmapProps {
  data: SpectrogramResponse | null
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

interface SampledSpectrogram {
  frequencyAxis: number[]
  originalColumns: number
  originalRows: number
  spectrogram: number[][]
  timeAxis: number[]
  timeTimestamps: string[]
}

interface HeatmapCell {
  energy: number
  frequencyValue: number
  height: number
  key: string
  timeTimestamp: string
  timeValue: number
  width: number
  x: number
  y: number
}

interface HoveredCellState {
  cell: HeatmapCell
  x: number
  y: number
}

const SVG_WIDTH = 980
const SVG_HEIGHT = 460
const MARGINS = {
  top: 24,
  right: 28,
  bottom: 58,
  left: 72,
}
const MAX_COLUMNS = 220
const MAX_ROWS = 72
const labelFormat = format('.2f')
const energyFormat = format('.3f')

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((total, value) => total + value, 0) / values.length
}

const buildWindows = (length: number, targetBuckets: number) => {
  if (length === 0) {
    return []
  }

  const step = Math.max(1, Math.ceil(length / targetBuckets))
  const windows: Array<[number, number]> = []

  for (let startIndex = 0; startIndex < length; startIndex += step) {
    windows.push([startIndex, Math.min(startIndex + step, length)])
  }

  return windows
}

const buildBoundaries = (values: number[]) => {
  if (values.length === 0) {
    return [0, 1]
  }
  if (values.length === 1) {
    const step = Math.max(Math.abs(values[0]) * 0.2, 1)
    return [Math.max(values[0] - step / 2, 0), values[0] + step / 2]
  }

  const boundaries = [
    Math.max(values[0] - (values[1] - values[0]) / 2, 0),
  ]

  for (let index = 1; index < values.length; index += 1) {
    boundaries.push((values[index - 1] + values[index]) / 2)
  }

  boundaries.push(
    values.at(-1)! + (values.at(-1)! - values.at(-2)!) / 2,
  )

  return boundaries
}

const sampleSpectrogram = (data: SpectrogramResponse | null): SampledSpectrogram | null => {
  if (!data) {
    return null
  }

  const originalRows = data.spectrogram.length
  const originalColumns = data.spectrogram[0]?.length ?? 0

  if (originalRows === 0 || originalColumns === 0) {
    return {
      frequencyAxis: [],
      originalColumns,
      originalRows,
      spectrogram: [],
      timeAxis: [],
      timeTimestamps: [],
    }
  }

  const rowWindows = buildWindows(originalRows, MAX_ROWS)
  const columnWindows = buildWindows(originalColumns, MAX_COLUMNS)

  const frequencyAxis = rowWindows.map(([startIndex, endIndex]) =>
    average(data.frequency_axis.slice(startIndex, endIndex)),
  )
  const timeAxis = columnWindows.map(([startIndex, endIndex]) =>
    average(data.time_axis.slice(startIndex, endIndex)),
  )
  const timeTimestamps = columnWindows.map(([startIndex, endIndex]) => {
    const midpoint = Math.min(
      Math.floor((startIndex + endIndex - 1) / 2),
      data.time_timestamps.length - 1,
    )
    return data.time_timestamps[midpoint] ?? data.signal_timestamps.at(-1) ?? 'N/A'
  })

  const spectrogram = rowWindows.map(([rowStart, rowEnd]) =>
    columnWindows.map(([columnStart, columnEnd]) => {
      let total = 0
      let count = 0

      for (let rowIndex = rowStart; rowIndex < rowEnd; rowIndex += 1) {
        for (
          let columnIndex = columnStart;
          columnIndex < columnEnd;
          columnIndex += 1
        ) {
          total += data.spectrogram[rowIndex]?.[columnIndex] ?? 0
          count += 1
        }
      }

      return count === 0 ? 0 : total / count
    }),
  )

  return {
    frequencyAxis,
    originalColumns,
    originalRows,
    spectrogram,
    timeAxis,
    timeTimestamps,
  }
}

export const SpectrogramHeatmap = ({
  data,
  loading,
  error,
  hint,
  onRetry,
  theme,
}: SpectrogramHeatmapProps) => {
  const colors = getChartColors(theme)
  const deferredData = useDeferredValue(data)
  const sampledData = useMemo(() => sampleSpectrogram(deferredData), [deferredData])
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [hoveredCell, setHoveredCell] = useState<HoveredCellState | null>(null)
  const clipPathId = useId()
  const legendGradientId = useId()

  const plotWidth = SVG_WIDTH - MARGINS.left - MARGINS.right
  const plotHeight = SVG_HEIGHT - MARGINS.top - MARGINS.bottom
  const timeBoundaries = buildBoundaries(sampledData?.timeAxis ?? [])
  const frequencyBoundaries = buildBoundaries(sampledData?.frequencyAxis ?? [])
  const xScale = scaleLinear()
    .domain([timeBoundaries[0] ?? 0, timeBoundaries.at(-1) ?? 1])
    .range([MARGINS.left, SVG_WIDTH - MARGINS.right])
  const yScale = scaleLinear()
    .domain([frequencyBoundaries[0] ?? 0, frequencyBoundaries.at(-1) ?? 1])
    .range([SVG_HEIGHT - MARGINS.bottom, MARGINS.top])

  const cells = useMemo(() => {
    if (!sampledData) {
      return []
    }

    const builtCells: HeatmapCell[] = []

    for (let rowIndex = 0; rowIndex < sampledData.spectrogram.length; rowIndex += 1) {
      for (
        let columnIndex = 0;
        columnIndex < sampledData.spectrogram[rowIndex].length;
        columnIndex += 1
      ) {
        const x = xScale(timeBoundaries[columnIndex] ?? 0)
        const nextX = xScale(timeBoundaries[columnIndex + 1] ?? timeBoundaries[columnIndex] ?? 1)
        const topBoundary = frequencyBoundaries[rowIndex + 1] ?? frequencyBoundaries[rowIndex] ?? 0
        const bottomBoundary = frequencyBoundaries[rowIndex] ?? 0
        const y = yScale(topBoundary)
        const nextY = yScale(bottomBoundary)

        builtCells.push({
          energy: sampledData.spectrogram[rowIndex][columnIndex] ?? 0,
          frequencyValue: sampledData.frequencyAxis[rowIndex] ?? 0,
          height: Math.max(nextY - y, 1.5),
          key: `${rowIndex}-${columnIndex}`,
          timeTimestamp: sampledData.timeTimestamps[columnIndex] ?? 'N/A',
          timeValue: sampledData.timeAxis[columnIndex] ?? 0,
          width: Math.max(nextX - x, 1.5),
          x,
          y,
        })
      }
    }

    return builtCells
  }, [frequencyBoundaries, sampledData, timeBoundaries, xScale, yScale])

  const energyDomain = extent(cells.map((cell) => Math.log1p(cell.energy)))
  const minLogEnergy = energyDomain[0] ?? 0
  const maxLogEnergy =
    energyDomain[1] && energyDomain[1] > minLogEnergy ? energyDomain[1] : 1
  const energyRange = maxLogEnergy - minLogEnergy || 1
  const colorScale = scaleSequential(interpolateViridis).domain([
    minLogEnergy,
    maxLogEnergy,
  ])
  const getLegendColor = (offset: number) =>
    colorScale(minLogEnergy + energyRange * offset)

  const updateTooltip = (
    cell: HeatmapCell,
    event: ReactMouseEvent<SVGRectElement>,
  ) => {
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (!bounds) {
      return
    }

    setHoveredCell({
      cell,
      x: Math.min(event.clientX - bounds.left + 18, bounds.width - 188),
      y: Math.max(event.clientY - bounds.top - 14, 12),
    })
  }

  return (
    <TrackChartCard
      title="Spectrogram Heatmap"
      detail="A D3-backed viridis heatmap of the transform energy surface. Hover any cell to inspect the time, frequency, and local energy."
      loading={loading}
      empty={cells.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="spectrogram-heatmap"
      exportRows={cells.map((cell) => ({
        energy: Number(cell.energy.toFixed(8)),
        frequency_cycles_per_day: Number(cell.frequencyValue.toFixed(8)),
        time_days: Number(cell.timeValue.toFixed(8)),
        timestamp: cell.timeTimestamp,
      }))}
      exportJson={data}
      footer={
        sampledData ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
            <span>
              Displaying {sampledData.timeAxis.length} time slices x{' '}
              {sampledData.frequencyAxis.length} frequency bands
            </span>
            <span>
              Source grid {sampledData.originalColumns} x {sampledData.originalRows}
            </span>
          </div>
        ) : null
      }
    >
      <div ref={wrapperRef} className="relative space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold text-ink">
              {data?.transform.toUpperCase() ?? 'STFT'} energy map
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
              Lower frequencies highlight slower market regimes
            </p>
          </div>
          <div className="min-w-[10rem]">
            <div
              className="h-3 w-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${getLegendColor(0)}, ${getLegendColor(0.5)}, ${getLegendColor(1)})`,
              }}
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
              <span>Low energy</span>
              <span>High energy</span>
            </div>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="h-[31rem] w-full overflow-hidden rounded-[24px]"
          role="img"
          aria-label="Spectrogram heatmap"
          onMouseLeave={() => setHoveredCell(null)}
        >
          <defs>
            <clipPath id={clipPathId}>
              <rect
                x={MARGINS.left}
                y={MARGINS.top}
                width={plotWidth}
                height={plotHeight}
                rx="18"
              />
            </clipPath>
            <linearGradient id={legendGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
              {[0, 0.5, 1].map((offset) => (
                <stop
                  key={offset}
                  offset={`${offset * 100}%`}
                  stopColor={getLegendColor(offset)}
                />
              ))}
            </linearGradient>
          </defs>

          <rect
            x="0"
            y="0"
            width={SVG_WIDTH}
            height={SVG_HEIGHT}
            rx="22"
            fill={colors.surface}
          />
          <g clipPath={`url(#${clipPathId})`}>
            {cells.map((cell) => (
              <rect
                key={cell.key}
                x={cell.x}
                y={cell.y}
                width={cell.width}
                height={cell.height}
                fill={colorScale(Math.log1p(cell.energy))}
                onMouseEnter={(event) => updateTooltip(cell, event)}
                onMouseMove={(event) => updateTooltip(cell, event)}
                opacity="0.96"
              />
            ))}
          </g>

          <rect
            x={MARGINS.left}
            y={MARGINS.top}
            width={plotWidth}
            height={plotHeight}
            rx="18"
            fill="none"
            stroke={colors.grid}
          />
          {xScale.ticks(6).map((tick) => (
            <g key={tick}>
              <line
                x1={xScale(tick)}
                x2={xScale(tick)}
                y1={SVG_HEIGHT - MARGINS.bottom}
                y2={SVG_HEIGHT - MARGINS.bottom + 6}
                stroke={colors.axis}
              />
              <text
                x={xScale(tick)}
                y={SVG_HEIGHT - MARGINS.bottom + 20}
                fill={colors.axis}
                fontSize="11"
                textAnchor="middle"
              >
                {labelFormat(tick)}
              </text>
            </g>
          ))}
          {yScale.ticks(5).map((tick) => (
            <g key={tick}>
              <line
                x1={MARGINS.left - 6}
                x2={MARGINS.left}
                y1={yScale(tick)}
                y2={yScale(tick)}
                stroke={colors.axis}
              />
              <text
                x={MARGINS.left - 10}
                y={yScale(tick) + 4}
                fill={colors.axis}
                fontSize="11"
                textAnchor="end"
              >
                {labelFormat(tick)}
              </text>
            </g>
          ))}
          <text
            x={MARGINS.left + plotWidth / 2}
            y={SVG_HEIGHT - 10}
            fill={colors.axis}
            fontSize="11"
            textAnchor="middle"
          >
            Time (days)
          </text>
          <text
            x={16}
            y={MARGINS.top + plotHeight / 2}
            fill={colors.axis}
            fontSize="11"
            textAnchor="middle"
            transform={`rotate(-90 16 ${MARGINS.top + plotHeight / 2})`}
          >
            Frequency (cycles/day)
          </text>
          <rect
            x={SVG_WIDTH - 164}
            y={14}
            width={126}
            height={10}
            rx="999"
            fill={`url(#${legendGradientId})`}
          />
        </svg>

        {hoveredCell ? (
          <div
            className="pointer-events-none absolute z-10 w-44 rounded-[18px] border border-stroke/70 bg-card/95 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
            style={{
              left: hoveredCell.x,
              top: hoveredCell.y,
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Heatmap Cell
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {hoveredCell.cell.timeTimestamp}
            </p>
            <div className="mt-2 space-y-1 text-xs leading-5 text-muted">
              <p>Time: {labelFormat(hoveredCell.cell.timeValue)} days</p>
              <p>
                Frequency: {labelFormat(hoveredCell.cell.frequencyValue)} cycles/day
              </p>
              <p>Energy: {energyFormat(hoveredCell.cell.energy)}</p>
            </div>
          </div>
        ) : null}
      </div>
    </TrackChartCard>
  )
}
