import { line, scaleLinear } from 'd3'
import { motion } from 'framer-motion'
import { useMemo } from 'react'

import type { STFTFrame, ThemeMode } from '../../types'
import { getChartColors } from '../charts/getChartColors'
import type { ExplainerSignalPoint } from './explainerData'

interface SlidingWindowAnimProps {
  signal: ExplainerSignalPoint[]
  frame: STFTFrame | null
  totalFrames: number
  reducedMotion: boolean
  theme: ThemeMode
  variant: 'focus' | 'overview'
}

const SVG_WIDTH = 360
const SVG_HEIGHT = 210
const MARGINS = {
  top: 16,
  right: 14,
  bottom: 16,
  left: 14,
}

const buildHighlightPath = (
  signal: ExplainerSignalPoint[],
  frame: STFTFrame | null,
  xScale: ReturnType<typeof scaleLinear>,
  yScale: ReturnType<typeof scaleLinear>,
) => {
  if (!frame) {
    return ''
  }

  const highlightedPoints = signal.filter((point) => {
    return point.index >= frame.segment_start && point.index < frame.segment_end
  })

  return (
    line<ExplainerSignalPoint>()
      .x((point) => Number(xScale(point.index)))
      .y((point) => Number(yScale(point.value)))(highlightedPoints) ?? ''
  )
}

export const SlidingWindowAnim = ({
  signal,
  frame,
  totalFrames,
  reducedMotion,
  theme,
  variant,
}: SlidingWindowAnimProps) => {
  const colors = getChartColors(theme)
  const chartWidth = SVG_WIDTH - MARGINS.left - MARGINS.right
  const chartHeight = SVG_HEIGHT - MARGINS.top - MARGINS.bottom
  const xDomainMax = Math.max(signal.length - 1, 1)
  const yValues = signal.map((point) => point.value)
  const minValue = Math.min(...yValues, 0)
  const maxValue = Math.max(...yValues, 1)
  const xScale = scaleLinear()
    .domain([0, xDomainMax])
    .range([MARGINS.left, SVG_WIDTH - MARGINS.right])
  const yScale = scaleLinear()
    .domain([minValue, maxValue === minValue ? minValue + 1 : maxValue])
    .range([SVG_HEIGHT - MARGINS.bottom, MARGINS.top])

  const signalPath = useMemo(() => {
    return (
      line<ExplainerSignalPoint>()
        .x((point) => Number(xScale(point.index)))
        .y((point) => Number(yScale(point.value)))(signal) ?? ''
    )
  }, [signal, xScale, yScale])

  const highlightedPath = useMemo(() => {
    return buildHighlightPath(signal, frame, xScale, yScale)
  }, [frame, signal, xScale, yScale])

  const highlightStart = frame ? xScale(frame.segment_start) : MARGINS.left
  const highlightEnd = frame
    ? xScale(Math.max(frame.segment_end - 1, frame.segment_start))
    : MARGINS.left + chartWidth * 0.22
  const highlightWidth = Math.max(highlightEnd - highlightStart, chartWidth * 0.08)
  const pulseX = highlightStart + highlightWidth / 2
  const pulseY = frame
    ? yScale(frame.segment[Math.floor(frame.segment.length / 2)] ?? frame.segment[0] ?? 0)
    : MARGINS.top + chartHeight / 2

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="h-[12.75rem] w-full rounded-[22px]"
        role="img"
        aria-label={
          variant === 'overview'
            ? 'Overview of the raw signal with the active STFT window'
            : 'Focused view of the active sliding window on the raw signal'
        }
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
        {variant === 'focus'
          ? [0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1={MARGINS.left}
                x2={SVG_WIDTH - MARGINS.right}
                y1={MARGINS.top + chartHeight * ratio}
                y2={MARGINS.top + chartHeight * ratio}
                stroke={colors.grid}
                strokeDasharray="4 6"
              />
            ))
          : null}

        <path
          d={signalPath}
          fill="none"
          stroke={variant === 'overview' ? colors.tealLine : colors.axis}
          strokeOpacity={variant === 'overview' ? 0.92 : 0.42}
          strokeWidth={variant === 'overview' ? 2.5 : 2}
        />

        {frame ? (
          <motion.rect
            x={highlightStart}
            y={MARGINS.top}
            width={highlightWidth}
            height={chartHeight}
            rx="16"
            fill={colors.amberFill}
            stroke={colors.amberLine}
            strokeWidth="1.5"
            animate={
              reducedMotion
                ? false
                : {
                    opacity: variant === 'overview' ? [0.58, 0.82, 0.58] : 0.86,
                  }
            }
            transition={
              variant === 'overview'
                ? { duration: 1.1, repeat: Number.POSITIVE_INFINITY }
                : undefined
            }
          />
        ) : null}

        {variant === 'focus' && highlightedPath ? (
          <path
            d={highlightedPath}
            fill="none"
            stroke={colors.amberLine}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {variant === 'overview' && frame ? (
          <motion.circle
            cx={pulseX}
            cy={pulseY}
            r="5"
            fill={colors.amberLine}
            animate={
              reducedMotion
                ? false
                : {
                    opacity: [0.5, 1, 0.5],
                    scale: [1, 1.35, 1],
                  }
            }
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
          />
        ) : null}
      </svg>

      {variant === 'overview' ? (
        <div className="flex items-center justify-between gap-3 text-xs leading-5 text-muted">
          <span>
            Window {frame ? `${frame.segment_start}–${Math.max(frame.segment_end - 1, frame.segment_start)}` : 'waiting'}
          </span>
          <span>{signal.length} sampled closes in the reconstructed signal</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
          <span>
            Frame {frame ? frame.frame_index + 1 : 0} / {Math.max(totalFrames, 1)}
          </span>
          <span>{frame?.frame_timestamp ?? 'Awaiting frame data'}</span>
        </div>
      )}
    </div>
  )
}
