import type { TrainingRuntimeResponse } from '../../types'

interface RecentTrainingResultsPanelProps {
  runtime: TrainingRuntimeResponse | null
  eyebrow?: string
  title?: string
  summary?: string
  maxVisibleResults?: number
}

const formatModeLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Waiting'
  }
  return value.replaceAll('_', ' ')
}

const formatTrainingSubject = (value: string | null | undefined) => {
  if (!value) {
    return 'Waiting'
  }
  if (value === 'ALL_STOCKS') {
    return 'All stocks'
  }
  return value
}

const formatValue = (
  value: number | null | undefined,
  options?: { digits?: number; suffix?: string },
) => {
  if (typeof value !== 'number') {
    return 'Unavailable'
  }
  return `${value.toFixed(options?.digits ?? 2)}${options?.suffix ?? ''}`
}

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 'Unavailable'
  }
  return new Date(value).toLocaleString()
}

export const RecentTrainingResultsPanel = ({
  runtime,
  eyebrow = 'Recent Completed Jobs',
  title = 'Latest finished training jobs',
  summary = 'Review the most recent local-training outcomes without opening the full report files.',
  maxVisibleResults = 4,
}: RecentTrainingResultsPanelProps) => {
  const results = [...(runtime?.results ?? [])].reverse().slice(0, maxVisibleResults)

  if (results.length === 0) {
    return null
  }

  return (
    <section className="card-surface space-y-3 p-6">
      <div className="space-y-2">
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="text-2xl text-ink">{title}</h3>
        <p className="max-w-3xl text-sm leading-7 text-muted">{summary}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {results.map((result) => (
          <div
            key={`${result.stock_id}-${result.mode}-${result.timestamp}`}
            className="rounded-[18px] border border-stroke/70 bg-card/70 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {formatTrainingSubject(result.stock_id)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                  {formatModeLabel(result.mode)}
                </p>
              </div>
              <span
                className={[
                  'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                  result.status === 'success'
                    ? 'border-teal/35 bg-teal/10 text-teal'
                    : 'border-amber/35 bg-amber/12 text-amber',
                ].join(' ')}
              >
                {result.status}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted">
              MSE {formatValue(result.after_mse)}
            </p>
            <p className="mt-1 text-xs leading-6 text-muted">
              {result.error ?? formatTimestamp(result.timestamp)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
