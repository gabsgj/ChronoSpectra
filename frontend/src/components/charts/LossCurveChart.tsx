import { max, scaleLinear } from 'd3'
import { useMemo, useRef, useState } from 'react'

import type { ThemeMode, TrainingEpochMetrics } from '../../types'
import { getChartColors } from './getChartColors'
import { getSvgCoordinates } from './getSvgCoordinates'
import { TrackChartCard } from './TrackChartCard'

interface LossCurveChartProps {
  history: TrainingEpochMetrics[]
  liveHistory?: TrainingEpochMetrics[]
  loading: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  theme: ThemeMode
}

interface LossTooltipDatum {
  epoch: number
  historicalTrain: number | null
  historicalVal: number | null
  liveTrain: number | null
  liveVal: number | null
}

interface LossCurvePlotProps {
  history: TrainingEpochMetrics[]
  liveHistory: TrainingEpochMetrics[]
  maxEpoch: number
  maxLoss: number
  theme: ThemeMode
  chartHeightClass?: string
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 320
const PADDING = { top: 20, right: 24, bottom: 52, left: 56 }

const formatLoss = (value: number | null) => {
  if (value === null) {
    return 'N/A'
  }
  if (value >= 100) {
    return value.toFixed(1)
  }
  if (value >= 10) {
    return value.toFixed(2)
  }
  return value.toFixed(4)
}

const buildPath = (
  points: TrainingEpochMetrics[],
  valueAccessor: (point: TrainingEpochMetrics) => number,
  maxEpoch: number,
  maxLoss: number,
) => {
  if (points.length === 0) {
    return ''
  }

  const width = CHART_WIDTH - PADDING.left - PADDING.right
  const height = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const resolveX = (epoch: number) => {
    if (maxEpoch <= 1) {
      return PADDING.left + width / 2
    }
    return PADDING.left + (width * Math.max(epoch - 1, 0)) / (maxEpoch - 1)
  }

  return points
    .map((point, index) => {
      const x = resolveX(point.epoch)
      const y =
        PADDING.top +
        height -
        (valueAccessor(point) / Math.max(maxLoss, 1e-9)) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

const buildTooltipData = (
  history: TrainingEpochMetrics[],
  liveHistory: TrainingEpochMetrics[],
) => {
  const epochMap = new Map<number, LossTooltipDatum>()

  history.forEach((point) => {
    epochMap.set(point.epoch, {
      epoch: point.epoch,
      historicalTrain: point.train_loss,
      historicalVal: point.val_loss,
      liveTrain: epochMap.get(point.epoch)?.liveTrain ?? null,
      liveVal: epochMap.get(point.epoch)?.liveVal ?? null,
    })
  })

  liveHistory.forEach((point) => {
    const existing = epochMap.get(point.epoch)
    epochMap.set(point.epoch, {
      epoch: point.epoch,
      historicalTrain: existing?.historicalTrain ?? null,
      historicalVal: existing?.historicalVal ?? null,
      liveTrain: point.train_loss,
      liveVal: point.val_loss,
    })
  })

  return [...epochMap.values()].sort((left, right) => left.epoch - right.epoch)
}

const LossCurvePlot = ({
  history,
  liveHistory,
  maxEpoch,
  maxLoss,
  theme,
  chartHeightClass = 'h-[22rem]',
}: LossCurvePlotProps) => {
  const colors = getChartColors(theme)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredEpoch, setHoveredEpoch] = useState<number | null>(null)
  const tooltipData = useMemo(() => buildTooltipData(history, liveHistory), [history, liveHistory])
  const drawableWidth = CHART_WIDTH - PADDING.left - PADDING.right
  const yScale = scaleLinear()
    .domain([0, maxLoss])
    .range([CHART_HEIGHT - PADDING.bottom, PADDING.top])
  const resolveX = (epoch: number) => {
    if (maxEpoch <= 1) {
      return PADDING.left + drawableWidth / 2
    }
    return PADDING.left + (drawableWidth * Math.max(epoch - 1, 0)) / (maxEpoch - 1)
  }
  const hoveredDatum =
    hoveredEpoch === null
      ? null
      : tooltipData.reduce<LossTooltipDatum | null>((closestPoint, candidate) => {
          if (!closestPoint) {
            return candidate
          }
          return Math.abs(candidate.epoch - hoveredEpoch) <
            Math.abs(closestPoint.epoch - hoveredEpoch)
            ? candidate
            : closestPoint
        }, null)
  const trainPath = buildPath(history, (point) => point.train_loss, maxEpoch, maxLoss)
  const valPath = buildPath(history, (point) => point.val_loss, maxEpoch, maxLoss)
  const liveTrainPath = buildPath(
    liveHistory,
    (point) => point.train_loss,
    maxEpoch,
    maxLoss,
  )
  const liveValPath = buildPath(
    liveHistory,
    (point) => point.val_loss,
    maxEpoch,
    maxLoss,
  )

  const updateHover = (clientX: number) => {
    const coordinates = getSvgCoordinates(svgRef.current, clientX, 0)
    if (!coordinates || tooltipData.length === 0) {
      return
    }

    const clampedChartX = Math.min(
      Math.max(coordinates.x, PADDING.left),
      CHART_WIDTH - PADDING.right,
    )
    const ratio = (clampedChartX - PADDING.left) / Math.max(drawableWidth, 1)
    const derivedEpoch = 1 + ratio * Math.max(maxEpoch - 1, 0)
    setHoveredEpoch(derivedEpoch)
  }

  return (
    <div className="relative space-y-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`${chartHeightClass} w-full overflow-hidden rounded-[24px]`}
        role="img"
        aria-label="Training loss curve"
        onMouseLeave={() => setHoveredEpoch(null)}
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
          const y = yScale(maxLoss * offset)
          return (
            <g key={offset}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
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
                {formatLoss(maxLoss * offset)}
              </text>
            </g>
          )
        })}
        <path
          d={trainPath}
          fill="none"
          stroke={colors.tealLine}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
        <path
          d={valPath}
          fill="none"
          stroke={colors.amberLine}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
        {liveTrainPath ? (
          <path
            d={liveTrainPath}
            fill="none"
            stroke={colors.tealLine}
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ) : null}
        {liveValPath ? (
          <path
            d={liveValPath}
            fill="none"
            stroke={colors.amberLine}
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ) : null}
        {hoveredDatum ? (
          <>
            <line
              x1={resolveX(hoveredDatum.epoch)}
              x2={resolveX(hoveredDatum.epoch)}
              y1={PADDING.top}
              y2={CHART_HEIGHT - PADDING.bottom}
              stroke={colors.axis}
              strokeDasharray="5 6"
            />
            {hoveredDatum.historicalTrain !== null ? (
              <circle
                cx={resolveX(hoveredDatum.epoch)}
                cy={yScale(hoveredDatum.historicalTrain)}
                r="5"
                fill={colors.surface}
                stroke={colors.tealLine}
                strokeWidth="2.5"
              />
            ) : null}
            {hoveredDatum.historicalVal !== null ? (
              <circle
                cx={resolveX(hoveredDatum.epoch)}
                cy={yScale(hoveredDatum.historicalVal)}
                r="5"
                fill={colors.surface}
                stroke={colors.amberLine}
                strokeWidth="2.5"
              />
            ) : null}
            {hoveredDatum.liveTrain !== null ? (
              <circle
                cx={resolveX(hoveredDatum.epoch)}
                cy={yScale(hoveredDatum.liveTrain)}
                r="6"
                fill={colors.surface}
                stroke={colors.tealLine}
                strokeDasharray="4 4"
                strokeWidth="2.5"
              />
            ) : null}
            {hoveredDatum.liveVal !== null ? (
              <circle
                cx={resolveX(hoveredDatum.epoch)}
                cy={yScale(hoveredDatum.liveVal)}
                r="6"
                fill={colors.surface}
                stroke={colors.amberLine}
                strokeDasharray="4 4"
                strokeWidth="2.5"
              />
            ) : null}
          </>
        ) : null}
        <text
          x={PADDING.left}
          y={CHART_HEIGHT - 18}
          fill={colors.axis}
          fontSize="11"
        >
          Epoch 1
        </text>
        <text
          x={CHART_WIDTH - PADDING.right}
          y={CHART_HEIGHT - 18}
          fill={colors.axis}
          fontSize="11"
          textAnchor="end"
        >
          Epoch {maxEpoch}
        </text>
      </svg>

      {hoveredDatum ? (
        <div
          className="pointer-events-none absolute z-10 w-64 rounded-[18px] border border-stroke/70 bg-card/95 p-3 text-xs leading-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur"
          style={{
            left: `clamp(0.75rem, calc(${((resolveX(hoveredDatum.epoch) / CHART_WIDTH) * 100).toFixed(2)}% - 8rem), calc(100% - 16rem))`,
            top: '3.5rem',
          }}
        >
          <p className="font-semibold">Epoch {hoveredDatum.epoch}</p>
          <div className="mt-2 space-y-1 text-muted">
            <p>Historical train: {formatLoss(hoveredDatum.historicalTrain)}</p>
            <p>Historical val: {formatLoss(hoveredDatum.historicalVal)}</p>
            {hoveredDatum.liveTrain !== null || hoveredDatum.liveVal !== null ? (
              <>
                <p>Live train: {formatLoss(hoveredDatum.liveTrain)}</p>
                <p>Live val: {formatLoss(hoveredDatum.liveVal)}</p>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const LossCurveChart = ({
  history,
  liveHistory = [],
  loading,
  error,
  hint,
  onRetry,
  theme,
}: LossCurveChartProps) => {
  const colors = getChartColors(theme)
  const allSeries = [...history, ...liveHistory]
  const maxEpoch = Math.max(max(allSeries, (point) => point.epoch) ?? 1, 1)
  const maxLoss =
    Math.max(max(allSeries.flatMap((point) => [point.train_loss, point.val_loss])) ?? 1, 1)
  const exportRows = useMemo(() => buildTooltipData(history, liveHistory), [history, liveHistory])

  return (
    <TrackChartCard
      title="Loss Curve"
      detail="Historical train and validation losses come from the saved training report. Dashed traces appear only while a new retraining run is actively streaming."
      loading={loading}
      empty={history.length === 0 && liveHistory.length === 0}
      error={error}
      hint={hint}
      onRetry={onRetry}
      downloadFileBase="training-loss-curve"
      exportRows={exportRows.map((row) => ({
        epoch: row.epoch,
        historical_train: row.historicalTrain,
        historical_val: row.historicalVal,
        live_train: row.liveTrain,
        live_val: row.liveVal,
      }))}
      exportJson={{
        history,
        live_history: liveHistory,
      }}
      expandedChildren={
        <LossCurvePlot
          history={history}
          liveHistory={liveHistory}
          maxEpoch={maxEpoch}
          maxLoss={maxLoss}
          theme={theme}
          chartHeightClass="h-[28rem]"
        />
      }
      footer={
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors.tealLine }}
            />
            Historical train
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors.amberLine }}
            />
            Historical val
          </span>
          {liveHistory.length > 0 ? (
            <>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-teal/60" />
                Live train
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-amber/60" />
                Live val
              </span>
            </>
          ) : null}
        </div>
      }
    >
      <LossCurvePlot
        history={history}
        liveHistory={liveHistory}
        maxEpoch={maxEpoch}
        maxLoss={maxLoss}
        theme={theme}
      />
    </TrackChartCard>
  )
}
