import type { RetrainingLogEntry } from '../../types'

interface RetrainingTimelineProps {
  entries: RetrainingLogEntry[]
}

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return 'Timestamp unavailable'
  }
  return new Date(value).toLocaleString()
}

const formatMse = (value: number | null) => {
  if (value === null) {
    return 'N/A'
  }
  return value.toFixed(value >= 1000 ? 0 : 2)
}

const resolveStatusClassName = (status: string) => {
  if (status === 'success') {
    return 'border-teal/35 bg-teal/10 text-teal'
  }
  return 'border-amber/35 bg-amber/12 text-amber'
}

export const RetrainingTimeline = ({ entries }: RetrainingTimelineProps) => {
  if (entries.length === 0) {
    return (
      <article className="card-surface p-6">
        <p className="eyebrow">Retraining Timeline</p>
        <p className="mt-4 text-sm leading-6 text-muted">
          No retraining history is available for this stock yet.
        </p>
      </article>
    )
  }

  return (
    <article className="card-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Retraining Timeline</p>
          <h3 className="mt-3 text-2xl text-ink">Recent refresh history</h3>
        </div>
        <p className="text-sm text-muted">{entries.length} logged runs</p>
      </div>

      <div className="mt-6 space-y-4">
        {entries.map((entry) => (
          <div
            key={`${entry.stock_id}-${entry.timestamp}-${entry.status}`}
            className="rounded-[22px] border border-stroke/70 bg-card/70 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-lg font-semibold text-ink">
                    {formatTimestamp(entry.timestamp)}
                  </p>
                  <span
                    className={[
                      'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                      resolveStatusClassName(entry.status),
                    ].join(' ')}
                  >
                    {entry.status}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  Mode: {entry.mode?.replaceAll('_', ' ') ?? 'Unknown'} | Reason:{' '}
                  {entry.reason ?? 'Unknown'}
                </p>
              </div>
              <div className="text-right text-sm text-muted">
                <p>Duration: {entry.duration_seconds?.toFixed(2) ?? 'N/A'}s</p>
                <p>Before MSE: {formatMse(entry.before_mse)}</p>
                <p>After MSE: {formatMse(entry.after_mse)}</p>
              </div>
            </div>
            {entry.error ? (
              <p className="mt-4 rounded-[18px] border border-amber/30 bg-amber/10 px-4 py-3 text-sm leading-6 text-muted">
                {entry.error}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  )
}
