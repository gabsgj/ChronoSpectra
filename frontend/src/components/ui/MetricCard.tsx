import { HoverHint } from './HoverHint'

interface MetricCardProps {
  label: string
  value: string
  detail: string
  hint?: string
}

export function MetricCard({ label, value, detail, hint }: MetricCardProps) {
  return (
    <article className="card-surface p-5" title={hint ?? detail}>
      <div className="flex items-center gap-2">
        <p className="eyebrow">{label}</p>
        <HoverHint label={hint ?? detail} />
      </div>
      <p className="mt-4 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  )
}
