import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from 'framer-motion'
import { useEffect, useState } from 'react'

import type { ThemeMode } from '../../types'
import { getChartColors } from '../charts/getChartColors'
import type { ExplainerPredictionSnapshot } from './explainerData'

interface PredictionOutputAnimProps {
  prediction: ExplainerPredictionSnapshot | null
  reducedMotion: boolean
  theme: ThemeMode
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

const formatSignedCurrency = (value: number) => {
  const formattedValue = formatCurrency(Math.abs(value))
  return value >= 0 ? `+${formattedValue}` : `-${formattedValue}`
}

export const PredictionOutputAnim = ({
  prediction,
  reducedMotion,
  theme,
}: PredictionOutputAnimProps) => {
  const colors = getChartColors(theme)
  const targetValue = prediction?.predictedPrice ?? 0
  const motionValue = useMotionValue(targetValue)
  const [displayValue, setDisplayValue] = useState(targetValue)

  useMotionValueEvent(motionValue, 'change', (latestValue) => {
    setDisplayValue(latestValue)
  })

  useEffect(() => {
    const controls = animate(motionValue, targetValue, {
      duration: reducedMotion ? 0 : 0.48,
      ease: 'easeOut',
    })

    return () => controls.stop()
  }, [motionValue, reducedMotion, targetValue])

  if (!prediction) {
    return (
      <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-stroke/70 text-sm text-muted">
        Waiting for the first animation frame.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <motion.div
        className="rounded-[22px] border border-stroke/70 bg-card/70 p-5"
        initial={false}
        animate={{
          opacity: 1,
          scale: reducedMotion ? 1 : [0.98, 1],
        }}
        transition={{ duration: reducedMotion ? 0 : 0.32 }}
      >
        <p className="eyebrow">Illustrative Readout</p>
        <p className="mt-3 text-3xl font-semibold text-ink">
          {formatCurrency(reducedMotion ? targetValue : displayValue)}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Predicted next-step close from the active STFT window.
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-muted">
              <span>Confidence band</span>
              <span>{Math.round(prediction.confidence * 100)}%</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-stroke/70">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${prediction.confidence * 100}%`,
                  backgroundColor: colors.tealLine,
                }}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-stroke/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Future Actual
              </p>
              <p className="mt-2 text-lg font-semibold text-ink">
                {formatCurrency(prediction.futureActual)}
              </p>
            </div>
            <div className="rounded-[18px] border border-stroke/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Delta
              </p>
              <p
                className="mt-2 text-lg font-semibold"
                style={{
                  color: prediction.delta >= 0 ? colors.tealLine : colors.amberLine,
                }}
              >
                {formatSignedCurrency(prediction.delta)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {prediction.deltaPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
        <span>
          Band {formatCurrency(prediction.bandLow)} to{' '}
          {formatCurrency(prediction.bandHigh)}
        </span>
        <span>
          Dominant frequency {prediction.dominantFrequency.toFixed(2)} cycles/day
        </span>
      </div>
    </div>
  )
}
