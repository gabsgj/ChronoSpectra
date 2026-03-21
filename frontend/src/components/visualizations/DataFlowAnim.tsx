import { motion } from 'framer-motion'

import type { ThemeMode } from '../../types'
import { getChartColors } from '../charts/getChartColors'

interface DataFlowAnimProps {
  playing: boolean
  progress: number
  reducedMotion: boolean
  theme: ThemeMode
}

export const DataFlowAnim = ({
  playing,
  progress,
  reducedMotion,
  theme,
}: DataFlowAnimProps) => {
  const colors = getChartColors(theme)
  const indicatorLeft = `${Math.min(Math.max(progress, 0), 1) * 100}%`

  return (
    <div className="relative overflow-hidden rounded-full border border-stroke/70 bg-card/70 px-5 py-4">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-muted">
        <span>Raw Signal</span>
        <span>Window</span>
        <span>FFT</span>
        <span>Heatmap</span>
        <span>CNN</span>
        <span>Prediction</span>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-stroke/70">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.tealLine }}
          initial={false}
          animate={{ width: indicatorLeft }}
          transition={{ duration: reducedMotion ? 0 : 0.3 }}
        />
      </div>
      <motion.div
        className="pointer-events-none absolute top-[2.45rem] h-4 w-4 rounded-full border border-card shadow-[0_0_0_6px_rgba(245,166,35,0.18)]"
        style={{
          backgroundColor: colors.amberLine,
          left: `calc(${indicatorLeft} - 0.5rem)`,
        }}
        animate={
          reducedMotion || !playing
            ? false
            : {
                scale: [1, 1.14, 1],
              }
        }
        transition={{ duration: 0.7, repeat: Number.POSITIVE_INFINITY }}
      />
    </div>
  )
}
