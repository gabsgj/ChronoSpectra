import { HoverHint } from './HoverHint'

interface ExchangeBadgeProps {
  exchange: string
}

export function ExchangeBadge({ exchange }: ExchangeBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal">
      {exchange}
      <HoverHint label={`Exchange badge. ${exchange} decides market hours, ticker suffix, and provider routing.`} />
    </span>
  )
}
