import { format, scaleLinear } from 'd3'
import { motion } from 'framer-motion'
import { useMemo } from 'react'

import type { STFTFrame, ThemeMode } from '../../types'
import { getChartColors } from '../charts/getChartColors'

interface STFTAnimProps {
  frame: STFTFrame | null
  frequencyAxis: number[]
  reducedMotion: boolean
  theme: ThemeMode
}

interface Bucket {
  amplitude: number
  frequency: number
}

const SVG_WIDTH = 360
const SVG_HEIGHT = 210
const MARGINS = {
  top: 18,
  right: 14,
  bottom: 28,
  left: 14,
}
const MAX_BUCKETS = 22
const frequencyFormat = format('.2f')

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((total, value) => total + value, 0) / values.length
}

const bucketColumn = (frame: STFTFrame | null, frequencyAxis: number[]) => {
  if (!frame || frame.fft_column.length === 0) {
    return []
  }

  const bucketSize = Math.max(1, Math.ceil(frame.fft_column.length / MAX_BUCKETS))

  return Array.from({ length: Math.ceil(frame.fft_column.length / bucketSize) }, (_, index) => {
    const startIndex = index * bucketSize
    const endIndex = Math.min(startIndex + bucketSize, frame.fft_column.length)
    return {
      amplitude: average(frame.fft_column.slice(startIndex, endIndex)),
      frequency: average(frequencyAxis.slice(startIndex, endIndex)),
    }
  })
}

export const STFTAnim = ({
  frame,
  frequencyAxis,
  reducedMotion,
  theme,
}: STFTAnimProps) => {
  const colors = getChartColors(theme)
  const buckets = useMemo(() => bucketColumn(frame, frequencyAxis), [frame, frequencyAxis])
  const chartWidth = SVG_WIDTH - MARGINS.left - MARGINS.right
  const chartHeight = SVG_HEIGHT - MARGINS.top - MARGINS.bottom
  const maxAmplitude = Math.max(...buckets.map((bucket) => bucket.amplitude), 1)
  const yScale = scaleLinear()
    .domain([0, maxAmplitude])
    .range([SVG_HEIGHT - MARGINS.bottom, MARGINS.top])
  const barWidth = buckets.length === 0 ? chartWidth : chartWidth / Math.max(buckets.length, 1)
  const dominantBucket = buckets.reduce<Bucket | null>((currentBest, bucket) => {
    if (!currentBest || bucket.amplitude > currentBest.amplitude) {
      return bucket
    }
    return currentBest
  }, null)

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="h-[12.75rem] w-full rounded-[22px]"
        role="img"
        aria-label="Animated STFT frequency bars"
      >
        <rect
          x="0"
          y="0"
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          rx="22"
          fill={colors.surface}
        />
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={MARGINS.left}
            x2={SVG_WIDTH - MARGINS.right}
            y1={MARGINS.top + chartHeight * ratio}
            y2={MARGINS.top + chartHeight * ratio}
            stroke={colors.grid}
            strokeDasharray="4 6"
          />
        ))}
        {buckets.map((bucket, index) => {
          const x = MARGINS.left + index * barWidth
          const y = yScale(bucket.amplitude)
          const height = SVG_HEIGHT - MARGINS.bottom - y
          return (
            <motion.rect
              key={`${bucket.frequency}-${index}`}
              x={x + 1.5}
              width={Math.max(barWidth - 3, 4)}
              rx="6"
              fill={colors.barAlt}
              initial={false}
              animate={{
                height: Math.max(height, 4),
                y,
              }}
              transition={{
                duration: reducedMotion ? 0 : 0.34,
                ease: 'easeOut',
              }}
            />
          )
        })}
        <line
          x1={MARGINS.left}
          x2={SVG_WIDTH - MARGINS.right}
          y1={SVG_HEIGHT - MARGINS.bottom}
          y2={SVG_HEIGHT - MARGINS.bottom}
          stroke={colors.axis}
        />
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
        <span>
          Dominant band:{' '}
          {dominantBucket ? `${frequencyFormat(dominantBucket.frequency)} cycles/day` : 'Waiting'}
        </span>
        <span>{buckets.length} amplitude buckets from the active FFT column</span>
      </div>
    </div>
  )
}
