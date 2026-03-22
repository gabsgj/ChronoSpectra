import type { ModelMode, ThemeMode } from '../../types'
import { getChartColors } from '../charts/getChartColors'

interface CNNArchitectureDiagramProps {
  mode: ModelMode
  stockCount: number
  theme: ThemeMode
}

interface ArchitectureStage {
  height: number
  key: string
  lines: string[]
  subtitle: string
  title: string
  width: number
  x: number
  y: number
}

interface DiagramConnectorBox {
  height: number
  width: number
  x: number
  y: number
}

const SVG_WIDTH = 1390
const SVG_HEIGHT = 438

const stageText = {
  extractor: [
    'Conv2d 1 -> 16, kernel 3, pad 1 + ReLU',
    'MaxPool2d kernel 2',
    'Conv2d 16 -> 32, kernel 3, pad 1 + ReLU',
    'MaxPool2d kernel 2',
    'Conv2d 32 -> 64, kernel 3, pad 1 + ReLU',
    'AdaptiveAvgPool2d output 4 x 4',
  ],
  head: [
    'Linear input -> 128',
    'ReLU',
    'Dropout 0.3',
    'Linear 128 -> 1',
  ],
}

const modeLabels: Record<ModelMode, string> = {
  both: 'Compare All',
  per_stock: 'Per-stock CNN',
  unified: 'Unified CNN',
  unified_with_embeddings: 'Unified + Embeddings CNN',
}

const modeExplanations: Record<ModelMode, string> = {
  both:
    'Compare All keeps the shared CNN backbone fixed and shows the optional embedding branch because one of the compared modes uses it.',
  per_stock:
    'Per-stock mode uses this CNN backbone without any stock embedding branch. Each stock gets its own checkpoint.',
  unified:
    'Unified mode uses the same CNN backbone without any stock embedding branch. One shared checkpoint serves every stock.',
  unified_with_embeddings:
    'Unified + Embeddings uses the shared CNN backbone plus a stock-identity embedding that is concatenated before the dense head.',
}

const baseStages: ArchitectureStage[] = [
  {
    height: 132,
    key: 'input',
    lines: ['Normalized transform image', 'batch x 1 x freq x time'],
    subtitle: 'Model input',
    title: 'Input Spectrogram',
    width: 196,
    x: 36,
    y: 214,
  },
  {
    height: 248,
    key: 'extractor',
    lines: stageText.extractor,
    subtitle: 'Shared feature extractor',
    title: 'CNN Backbone',
    width: 390,
    x: 270,
    y: 126,
  },
  {
    height: 132,
    key: 'flatten',
    lines: ['Flatten feature maps', '64 x 4 x 4 = 1024 values'],
    subtitle: 'Vectorization',
    title: 'Flatten',
    width: 186,
    x: 706,
    y: 214,
  },
  {
    height: 146,
    key: 'fusion',
    lines: ['Feature handoff before dense head'],
    subtitle: 'Fusion point',
    title: 'Concat / Pass-through',
    width: 254,
    x: 914,
    y: 206,
  },
  {
    height: 180,
    key: 'head',
    lines: stageText.head,
    subtitle: 'Regressor',
    title: 'Prediction Head',
    width: 178,
    x: 1204,
    y: 190,
  },
]

const connectorStyle = {
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 3,
}

const mobileArrowClassName =
  'text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted'

const buildHorizontalConnectorPath = (
  fromStage: ArchitectureStage,
  toStage: ArchitectureStage,
) => {
  const fromEdge = fromStage.x + fromStage.width
  const toEdge = toStage.x
  const gap = Math.max(toEdge - fromEdge, 2)
  const inset = Math.min(18, Math.max(gap * 0.28, 6))
  const startX = fromEdge + inset
  const endX = Math.max(toEdge - inset, startX + 2)

  return `M ${startX} ${fromStage.y + fromStage.height / 2} L ${endX} ${
    toStage.y + toStage.height / 2
  }`
}

export const CNNArchitectureDiagram = ({
  mode,
  stockCount,
  theme,
}: CNNArchitectureDiagramProps) => {
  const colors = getChartColors(theme)
  const foregroundColor = theme === 'light' ? '#152033' : '#edf3fb'
  const showEmbeddingPath =
    mode === 'unified_with_embeddings' || mode === 'both'
  const fusionLines =
    mode === 'unified_with_embeddings'
      ? ['1024 CNN features', '+ 8 embedding dims', '1032 values enter head']
      : mode === 'both'
        ? ['Standard modes pass through', 'Embedding mode adds', '8 stock-id dims']
        : ['No extra branch in this mode', '1024 CNN features pass through']
  const embeddingLines =
    mode === 'unified_with_embeddings'
      ? [`nn.Embedding(${stockCount}, 8)`, 'Joined with CNN features before the dense head']
      : ['Optional branch for Unified + Embeddings only', `Configured for ${stockCount} active stocks`]

  const stages = baseStages.map((stage) =>
    stage.key === 'fusion'
      ? {
          ...stage,
          lines: fusionLines,
        }
      : stage,
  )

  const stageLookup = new Map(stages.map((stage) => [stage.key, stage]))
  const inputStage = stageLookup.get('input')
  const extractorStage = stageLookup.get('extractor')
  const flattenStage = stageLookup.get('flatten')
  const fusionStage = stageLookup.get('fusion')
  const headStage = stageLookup.get('head')
  const embeddingBox: DiagramConnectorBox | null =
    showEmbeddingPath && fusionStage
      ? {
          height: 130,
          width: 262,
          x: 910,
          y: 32,
        }
      : null

  const renderStage = (
    stage: ArchitectureStage,
    options?: {
      accent?: string
      border?: string
      muted?: boolean
    },
  ) => {
    const accent = options?.accent ?? colors.tealFill
    const border = options?.border ?? colors.tealLine
    const titleColor = options?.muted ? colors.axis : foregroundColor
    const detailColor = options?.muted ? colors.axis : colors.axis
    const titleFontSize = stage.width <= 190 ? 17 : stage.width <= 220 ? 18 : 20
    const lineFontSize = stage.width <= 190 ? 12 : stage.width <= 260 ? 13 : 14

    return (
      <g key={stage.key}>
        <rect
          x={stage.x}
          y={stage.y}
          width={stage.width}
          height={stage.height}
          rx="26"
          fill={colors.surface}
          stroke={border}
          strokeWidth="1.8"
        />
        <rect
          x={stage.x}
          y={stage.y}
          width={stage.width}
          height="54"
          rx="26"
          fill={accent}
          opacity="0.7"
        />
        <text
          x={stage.x + 18}
          y={stage.y + 24}
          fill={detailColor}
          fontSize="11"
          letterSpacing="0.18em"
        >
          {stage.subtitle.toUpperCase()}
        </text>
        <text
          x={stage.x + 18}
          y={stage.y + 48}
          fill={titleColor}
          fontSize={titleFontSize}
          fontWeight="600"
        >
          {stage.title}
        </text>
        {stage.lines.map((line, index) => (
          <text
            key={`${stage.key}-${line}`}
            x={stage.x + 18}
            y={stage.y + 86 + index * 24}
            fill={detailColor}
            fontSize={lineFontSize}
          >
            {line}
          </text>
        ))}
      </g>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          <p className="eyebrow">CNN Architecture Diagram</p>
          <h3 className="text-2xl text-ink">Prediction network used by ChronoSpectra</h3>
          <p className="text-sm leading-7 text-muted">
            This diagram is drawn from the actual backend model code, not a mockup.
            The shared backbone lives in `backend/models/base_model.py`, and the
            optional stock-embedding branch comes from `backend/models/unified_cnn_with_embeddings.py`.
          </p>
        </div>
        <div className="max-w-md rounded-[20px] border border-stroke/70 bg-card/70 px-4 py-3 text-sm leading-6 text-muted">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">
            Active mode
          </p>
          <p className="mt-2 text-lg font-semibold text-ink">{modeLabels[mode]}</p>
          <p className="mt-2">{modeExplanations[mode]}</p>
        </div>
      </div>

      <div className="hidden md:block">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full rounded-[26px]"
          role="img"
          aria-label="ChronoSpectra CNN architecture diagram"
        >
          <defs>
            <marker
              id="architecture-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={colors.axis} />
            </marker>
          </defs>

          <rect
            x="0"
            y="0"
            width={SVG_WIDTH}
            height={SVG_HEIGHT}
            rx="28"
            fill={colors.surface}
          />

          {inputStage && extractorStage ? (
            <path
              d={buildHorizontalConnectorPath(inputStage, extractorStage)}
              stroke={colors.axis}
              markerEnd="url(#architecture-arrow)"
              {...connectorStyle}
            />
          ) : null}

          {extractorStage && flattenStage ? (
            <path
              d={buildHorizontalConnectorPath(extractorStage, flattenStage)}
              stroke={colors.axis}
              markerEnd="url(#architecture-arrow)"
              {...connectorStyle}
            />
          ) : null}

          {flattenStage && fusionStage ? (
            <path
              d={buildHorizontalConnectorPath(flattenStage, fusionStage)}
              stroke={colors.axis}
              markerEnd="url(#architecture-arrow)"
              {...connectorStyle}
            />
          ) : null}

          {fusionStage && headStage ? (
            <path
              d={buildHorizontalConnectorPath(fusionStage, headStage)}
              stroke={colors.axis}
              markerEnd="url(#architecture-arrow)"
              {...connectorStyle}
            />
          ) : null}

          {showEmbeddingPath && embeddingBox && fusionStage ? (
            <>
              <path
                d={`M ${embeddingBox.x + embeddingBox.width / 2} ${
                  embeddingBox.y + embeddingBox.height + 6
                } L ${embeddingBox.x + embeddingBox.width / 2} ${fusionStage.y - 16}`}
                stroke={mode === 'unified_with_embeddings' ? colors.amberLine : colors.grid}
                markerEnd="url(#architecture-arrow)"
                {...connectorStyle}
              />
              <g>
                <rect
                  x={embeddingBox.x}
                  y={embeddingBox.y}
                  width={embeddingBox.width}
                  height={embeddingBox.height}
                  rx="24"
                  fill={colors.surface}
                  stroke={mode === 'unified_with_embeddings' ? colors.amberLine : colors.grid}
                  strokeDasharray={mode === 'both' ? '6 6' : undefined}
                  strokeWidth="1.8"
                />
                <rect
                  x={embeddingBox.x}
                  y={embeddingBox.y}
                  width={embeddingBox.width}
                  height="44"
                  rx="24"
                  fill={colors.amberFill}
                  opacity="0.84"
                />
                <text
                  x={embeddingBox.x + 18}
                  y={embeddingBox.y + 28}
                  fill={colors.axis}
                  fontSize="11"
                  letterSpacing="0.18em"
                >
                  EMBEDDING BRANCH
                </text>
                {embeddingLines.map((line, index) => (
                  <text
                    key={line}
                    x={embeddingBox.x + 18}
                    y={embeddingBox.y + 68 + index * 22}
                    fill={foregroundColor}
                    fontSize="14"
                  >
                    {line}
                  </text>
                ))}
              </g>
            </>
          ) : null}

          {stages.map((stage) =>
            renderStage(stage, {
              accent:
                stage.key === 'head'
                  ? colors.amberFill
                  : stage.key === 'fusion'
                    ? showEmbeddingPath
                      ? colors.amberFill
                      : colors.tealFill
                    : colors.tealFill,
              border:
                stage.key === 'fusion' && !showEmbeddingPath
                  ? colors.grid
                  : stage.key === 'head'
                    ? colors.amberLine
                    : colors.tealLine,
            }),
          )}
        </svg>
      </div>

      <div className="grid gap-3 md:hidden">
        <MobileStageCard
          eyebrow="Model input"
          title="Input Spectrogram"
          lines={['Normalized transform image', 'batch x 1 x freq x time']}
        />
        <div className={mobileArrowClassName}>↓</div>
        <MobileStageCard
          eyebrow="Shared feature extractor"
          title="CNN Backbone"
          lines={stageText.extractor}
        />
        <div className={mobileArrowClassName}>↓</div>
        <MobileStageCard
          eyebrow="Vectorization"
          title="Flatten"
          lines={['Flatten feature maps', '64 x 4 x 4 = 1024 values']}
        />
        {showEmbeddingPath ? (
          <>
            <div className={mobileArrowClassName}>↓</div>
            <MobileStageCard
              eyebrow="Optional branch"
              title="Stock Embedding"
              lines={embeddingLines}
              tone="amber"
            />
          </>
        ) : null}
        <div className={mobileArrowClassName}>↓</div>
        <MobileStageCard
          eyebrow="Fusion point"
          title="Concat / Pass-through"
          lines={fusionLines}
          tone={showEmbeddingPath ? 'amber' : 'teal'}
        />
        <div className={mobileArrowClassName}>↓</div>
        <MobileStageCard
          eyebrow="Regressor"
          title="Prediction Head"
          lines={stageText.head}
          tone="amber"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <SummaryCard
          label="Feature vector"
          value="1024"
          detail="The backbone always ends at 64 channels x 4 x 4 pooled features before the dense head."
        />
        <SummaryCard
          label="Dense head"
          value="128 hidden units"
          detail="Every mode uses the same dense head shape with ReLU and dropout 0.3 before the final scalar output."
        />
        <SummaryCard
          label="Embedding branch"
          value={showEmbeddingPath ? '8 dimensions' : 'Inactive'}
          detail={
            showEmbeddingPath
              ? 'The unified-embedding model concatenates an 8-dimensional stock-id vector before the dense head.'
              : 'Per-stock and unified modes skip the stock-identity branch entirely.'
          }
        />
      </div>
    </div>
  )
}

interface MobileStageCardProps {
  eyebrow: string
  title: string
  lines: string[]
  tone?: 'amber' | 'teal'
}

const MobileStageCard = ({
  eyebrow,
  title,
  lines,
  tone = 'teal',
}: MobileStageCardProps) => {
  return (
    <div
      className={`rounded-[22px] border p-4 ${
        tone === 'amber'
          ? 'border-amber/30 bg-amber/10'
          : 'border-teal/25 bg-teal/8'
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
      <p className="mt-2 text-lg font-semibold text-ink">{title}</p>
      <div className="mt-3 space-y-2">
        {lines.map((line) => (
          <p key={line} className="text-sm leading-6 text-muted">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

interface SummaryCardProps {
  detail: string
  label: string
  value: string
}

const SummaryCard = ({
  detail,
  label,
  value,
}: SummaryCardProps) => {
  return (
    <div className="rounded-[20px] border border-stroke/70 bg-card/70 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </div>
  )
}
