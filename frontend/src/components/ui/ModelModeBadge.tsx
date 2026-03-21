import type { ModelMode } from '../../types'
import { HoverHint } from './HoverHint'

interface ModelModeBadgeProps {
  mode: ModelMode
}

const MODE_LABELS: Record<ModelMode, string> = {
  per_stock: 'Per Stock',
  unified: 'Unified',
  unified_with_embeddings: 'Unified + Embeddings',
  both: 'Compare All',
}

export function ModelModeBadge({ mode }: ModelModeBadgeProps) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-amber/30 bg-amber/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber">
      <span className="min-w-0 break-words">{MODE_LABELS[mode]}</span>
      <HoverHint label="Model mode badge. Per Stock means one model per stock. Unified means one shared model. Unified + Embeddings means one shared model plus learned stock identity vectors. Compare All means the UI is comparing multiple modes." />
    </span>
  )
}
