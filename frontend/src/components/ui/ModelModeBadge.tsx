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
    <span
      className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber"
      title="Model mode badge. It tells you whether the app is using one model per stock, one shared model, or a comparison mode."
    >
      {MODE_LABELS[mode]}
      <HoverHint label="Model mode badge. Per Stock means one model per stock. Unified means one shared model. Unified + Embeddings means one shared model plus learned stock identity vectors. Compare All means the UI is comparing multiple modes." />
    </span>
  )
}
