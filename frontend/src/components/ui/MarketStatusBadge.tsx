import { HoverHint } from './HoverHint'

interface MarketStatusBadgeProps {
  label: string
  tone: 'teal' | 'amber'
  hint?: string
}

export function MarketStatusBadge({
  label,
  tone,
  hint,
}: MarketStatusBadgeProps) {
  const toneClasses = tone === 'teal'
    ? 'border-teal/25 bg-teal/10 text-teal'
    : 'border-amber/30 bg-amber/12 text-amber'

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${toneClasses}`}>
      {label}
      {hint ? <HoverHint label={hint} /> : null}
    </span>
  )
}
