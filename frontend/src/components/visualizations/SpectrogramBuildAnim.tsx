import {
  extent,
  interpolateViridis,
  scaleLinear,
  scaleSequential,
} from 'd3'
import { useMemo } from 'react'

import type { STFTFrame, ThemeMode } from '../../types'
import { getChartColors } from '../charts/getChartColors'

interface SpectrogramBuildAnimProps {
  currentFrame: number
  frames: STFTFrame[]
  frequencyAxis: number[]
  reducedMotion: boolean
  theme: ThemeMode
}

const SVG_WIDTH = 360
const SVG_HEIGHT = 210
const MARGINS = {
  top: 16,
  right: 16,
  bottom: 16,
  left: 16,
}
const MAX_ROWS = 24

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((total, value) => total + value, 0) / values.length
}

const sampleColumns = (frames: STFTFrame[], frequencyAxis: number[]) => {
  if (frames.length === 0 || frequencyAxis.length === 0) {
    return []
  }

  const bucketSize = Math.max(1, Math.ceil(frequencyAxis.length / MAX_ROWS))
  return frames.map((frame) => ({
    amplitude: Array.from(
      { length: Math.ceil(frame.fft_column.length / bucketSize) },
      (_, bucketIndex) => {
        const startIndex = bucketIndex * bucketSize
        const endIndex = Math.min(startIndex + bucketSize, frame.fft_column.length)
        return average(frame.fft_column.slice(startIndex, endIndex))
      },
    ),
  }))
}

export const SpectrogramBuildAnim = ({
  currentFrame,
  frames,
  frequencyAxis,
  reducedMotion,
  theme,
}: SpectrogramBuildAnimProps) => {
  const colors = getChartColors(theme)
  const sampledColumns = useMemo(
    () => sampleColumns(frames, frequencyAxis),
    [frames, frequencyAxis],
  )
  const rowCount = sampledColumns[0]?.amplitude.length ?? 0
  const chartWidth = SVG_WIDTH - MARGINS.left - MARGINS.right
  const chartHeight = SVG_HEIGHT - MARGINS.top - MARGINS.bottom
  const columnWidth =
    sampledColumns.length === 0 ? chartWidth : chartWidth / sampledColumns.length
  const rowHeight = rowCount === 0 ? chartHeight : chartHeight / rowCount
  const energyDomain = extent(
    sampledColumns.flatMap((column) => column.amplitude.map((value) => Math.log1p(value))),
  )
  const colorScale = scaleSequential(interpolateViridis).domain([
    energyDomain[0] ?? 0,
    energyDomain[1] && energyDomain[1] > (energyDomain[0] ?? 0)
      ? energyDomain[1]
      : 1,
  ])
  const guideScale = scaleLinear()
    .domain([0, Math.max(sampledColumns.length - 1, 1)])
    .range([MARGINS.left, SVG_WIDTH - MARGINS.right - columnWidth])
  const builtColumnCount = Math.min(currentFrame + 1, sampledColumns.length)

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="h-[12.75rem] w-full rounded-[22px]"
        role="img"
        aria-label="Spectrogram building column by column"
      >
        <rect
          x="0"
          y="0"
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          rx="22"
          fill={colors.surface}
        />
        <rect
          x={MARGINS.left}
          y={MARGINS.top}
          width={chartWidth}
          height={chartHeight}
          rx="18"
          fill="none"
          stroke={colors.grid}
        />

        {sampledColumns.map((column, columnIndex) =>
          column.amplitude.map((value, rowIndex) => (
            <rect
              key={`${columnIndex}-${rowIndex}`}
              x={MARGINS.left + columnIndex * columnWidth}
              y={MARGINS.top + (rowCount - rowIndex - 1) * rowHeight}
              width={Math.max(columnWidth, 1.5)}
              height={Math.max(rowHeight, 1.5)}
              fill={colorScale(Math.log1p(value))}
              opacity={columnIndex <= currentFrame ? 0.96 : 0.08}
              style={{
                transition: reducedMotion ? 'none' : 'opacity 180ms linear',
              }}
            />
          )),
        )}

        {sampledColumns.length > 0 ? (
          <rect
            x={guideScale(Math.min(currentFrame, sampledColumns.length - 1))}
            y={MARGINS.top}
            width={Math.max(columnWidth, 1.5)}
            height={chartHeight}
            fill="none"
            stroke={colors.amberLine}
            strokeDasharray="5 6"
          />
        ) : null}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
        <span>{builtColumnCount} of {sampledColumns.length} columns revealed</span>
        <span>Energy accumulates from low to high frequencies across time</span>
      </div>
    </div>
  )
}
