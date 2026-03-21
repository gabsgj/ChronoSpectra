import { motion } from 'framer-motion'

import type { ThemeMode } from '../../types'
import { getChartColors } from '../charts/getChartColors'

interface CNNForwardPassAnimProps {
  progress: number
  reducedMotion: boolean
  theme: ThemeMode
}

const SVG_WIDTH = 360
const SVG_HEIGHT = 210
const layerNodes = [
  { key: 'input', label: 'Input', x: 38, y: 90, width: 44, height: 44 },
  { key: 'conv1', label: 'Conv 1', x: 100, y: 72, width: 52, height: 64 },
  { key: 'pool', label: 'Pool', x: 170, y: 84, width: 44, height: 40 },
  { key: 'conv2', label: 'Conv 2', x: 230, y: 72, width: 52, height: 64 },
  { key: 'dense', label: 'Dense', x: 300, y: 90, width: 34, height: 44 },
]

export const CNNForwardPassAnim = ({
  progress,
  reducedMotion,
  theme,
}: CNNForwardPassAnimProps) => {
  const colors = getChartColors(theme)
  const pathStart = layerNodes[0].x + layerNodes[0].width / 2
  const pathEnd = layerNodes.at(-1)!.x + layerNodes.at(-1)!.width / 2
  const activeLayer = Math.floor(progress * layerNodes.length)
  const indicatorX = pathStart + (pathEnd - pathStart) * progress

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="h-[12.75rem] w-full rounded-[22px]"
        role="img"
        aria-label="CNN forward-pass animation"
      >
        <rect
          x="0"
          y="0"
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          rx="22"
          fill={colors.surface}
        />
        <path
          d={`M ${pathStart} 112 L ${pathEnd} 112`}
          stroke={colors.grid}
          strokeWidth="10"
          strokeLinecap="round"
        />

        {layerNodes.map((node, index) => {
          const isActive = index <= activeLayer
          return (
            <g key={node.key}>
              {[0, 1, 2].map((offset) => (
                <rect
                  key={`${node.key}-${offset}`}
                  x={node.x - offset * 4}
                  y={node.y + offset * 4}
                  width={node.width}
                  height={node.height}
                  rx="14"
                  fill={isActive ? colors.tealFill : colors.surface}
                  stroke={isActive ? colors.tealLine : colors.grid}
                  opacity={offset === 0 ? 1 : 0.58 - offset * 0.14}
                />
              ))}
              <text
                x={node.x + node.width / 2}
                y={node.y + node.height + 28}
                fill={colors.axis}
                fontSize="11"
                textAnchor="middle"
              >
                {node.label}
              </text>
            </g>
          )
        })}

        <motion.circle
          cy="112"
          r="7"
          fill={colors.amberLine}
          initial={false}
          animate={{ cx: indicatorX }}
          transition={{
            duration: reducedMotion ? 0 : 0.34,
            ease: 'easeInOut',
          }}
        />
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-muted">
        <span>Active stage: {layerNodes[Math.min(activeLayer, layerNodes.length - 1)]?.label ?? 'Input'}</span>
        <span>One shared frame index lights up the forward path</span>
      </div>
    </div>
  )
}
