import type { ReactNode } from 'react'

import type { TrainingRuntimeResponse } from '../../types'

type RuntimeQueueStatus = 'completed' | 'failed' | 'active' | 'queued' | 'pending'

interface RuntimeQueueEntry {
  description: string
  index: number
  label: string
  modeLabel: string
  status: RuntimeQueueStatus
  subjectLabel: string
}

interface LocalTrainingQueuePanelProps {
  runtime: TrainingRuntimeResponse | null
  loading?: boolean
  error?: string | null
  hint?: string | null
  onRetry?: () => void
  eyebrow?: string
  headerExtras?: ReactNode
  title?: string
  summary?: string
  maxVisibleJobs?: number | null
}

const formatModeLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Waiting'
  }
  return value.replaceAll('_', ' ')
}

const formatTrainingStage = (value: string | null | undefined) => {
  if (!value) {
    return 'Waiting'
  }
  return value.replaceAll('_', ' ')
}

const formatSubjectLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Waiting'
  }
  if (value === 'ALL_STOCKS') {
    return 'All stocks'
  }
  return value
}

const buildRuntimeQueue = (
  runtime: TrainingRuntimeResponse | null,
): RuntimeQueueEntry[] => {
  if (!runtime?.job_labels.length) {
    return []
  }

  return runtime.job_labels.map((label, index) => {
    const [subjectPart, modePart] = label.split(' / ')
    const result = runtime.results[index] ?? null
    let status: RuntimeQueueStatus = 'pending'
    let description = 'Waiting for this job to start.'

    if (result?.status === 'failed') {
      status = 'failed'
      description =
        result.error ?? 'This job failed before the new artifacts were saved.'
    } else if (result) {
      status = 'completed'
      description =
        typeof result.after_mse === 'number'
          ? `Finished with MSE ${result.after_mse.toFixed(2)}.`
          : 'Finished and wrote its latest artifacts.'
    } else if (runtime.is_running && runtime.active_job_label === label) {
      status = 'active'
      description =
        runtime.active_stage_detail ??
        'Worker is starting and will report stage updates here.'
    } else if (runtime.is_running) {
      status = 'queued'
      description = 'Queued behind the jobs above it in the current run.'
    }

    return {
      description,
      index,
      label,
      modeLabel: formatModeLabel(modePart ?? null),
      status,
      subjectLabel: formatSubjectLabel(subjectPart ?? null),
    }
  })
}

const resolveQueueStatusClasses = (status: RuntimeQueueStatus) => {
  switch (status) {
    case 'completed':
      return {
        badge: 'border-teal/35 bg-teal/10 text-teal',
        card: 'border-teal/20 bg-teal/6',
        rail: 'bg-teal',
      }
    case 'failed':
      return {
        badge: 'border-amber/35 bg-amber/12 text-amber',
        card: 'border-amber/25 bg-amber/8',
        rail: 'bg-amber',
      }
    case 'active':
      return {
        badge: 'border-sky/35 bg-sky/10 text-sky',
        card: 'border-sky/25 bg-sky/8',
        rail: 'bg-sky',
      }
    case 'queued':
      return {
        badge: 'border-stroke/70 bg-card/85 text-muted',
        card: 'border-stroke/70 bg-card/70',
        rail: 'bg-stroke',
      }
    default:
      return {
        badge: 'border-stroke/55 bg-card/55 text-muted',
        card: 'border-stroke/55 bg-card/55',
        rail: 'bg-stroke/80',
      }
  }
}

const formatQueueStatusLabel = (status: RuntimeQueueStatus) => {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'active':
      return 'Active'
    case 'queued':
      return 'Queued'
    default:
      return 'Pending'
  }
}

const selectVisibleQueueEntries = (
  entries: RuntimeQueueEntry[],
  maxVisibleJobs: number | null,
) => {
  if (maxVisibleJobs === null) {
    return entries
  }

  if (entries.length <= maxVisibleJobs) {
    return entries
  }

  const activeIndex = entries.findIndex((entry) => entry.status === 'active')
  if (activeIndex === -1) {
    return entries.slice(0, maxVisibleJobs)
  }

  const halfWindow = Math.floor(maxVisibleJobs / 2)
  let startIndex = Math.max(0, activeIndex - halfWindow)
  let endIndex = startIndex + maxVisibleJobs

  if (endIndex > entries.length) {
    endIndex = entries.length
    startIndex = Math.max(0, endIndex - maxVisibleJobs)
  }

  return entries.slice(startIndex, endIndex)
}

export const LocalTrainingQueuePanel = ({
  runtime,
  loading = false,
  error = null,
  hint = null,
  onRetry,
  eyebrow = 'Runtime Queue',
  headerExtras,
  title = 'Local Training Queue',
  summary = 'See the order of shared and per-stock jobs, along with the stage currently running on the backend.',
  maxVisibleJobs = 4,
}: LocalTrainingQueuePanelProps) => {
  const queueEntries = buildRuntimeQueue(runtime)
  const visibleEntries = selectVisibleQueueEntries(queueEntries, maxVisibleJobs)
  const progressPercent =
    runtime && (runtime.total_jobs ?? 0) > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (((runtime.completed_jobs ?? 0) / (runtime.total_jobs ?? 1)) * 100),
          ),
        )
      : 0

  return (
    <section className="card-surface space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="text-2xl text-ink">{title}</h3>
          <p className="max-w-3xl text-sm leading-7 text-muted">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={[
              'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
              runtime?.is_running
                ? 'border-amber/35 bg-amber/12 text-amber'
                : 'border-teal/35 bg-teal/10 text-teal',
            ].join(' ')}
          >
            {runtime?.is_running ? 'Run in progress' : 'Runtime idle'}
          </span>
          <span className="inline-flex rounded-full border border-stroke/70 bg-card/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {runtime ? `${runtime.completed_jobs ?? 0} / ${runtime.total_jobs ?? 0} jobs` : 'Waiting'}
          </span>
          {headerExtras}
        </div>
      </div>

      {runtime ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current job</p>
              <p className="mt-2 text-lg font-semibold text-ink">
                {runtime.active_job_label ?? 'Waiting'}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                {runtime.active_stage_detail ?? 'The next backend stage update will appear here.'}
              </p>
            </div>
            <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Stage</p>
              <p className="mt-2 text-lg font-semibold capitalize text-ink">
                {formatTrainingStage(runtime.active_stage)}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Updated{' '}
                {runtime.active_stage_updated_at
                  ? new Date(runtime.active_stage_updated_at).toLocaleString()
                  : 'when the next stage starts'}
              </p>
            </div>
            <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Stock jobs</p>
              <p className="mt-2 text-lg font-semibold text-ink">
                {runtime.completed_stocks} / {runtime.total_stocks}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Shared jobs run once across all stocks before the per-stock queue.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-[20px] border border-stroke/70 bg-card/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Queue progress</p>
              <p className="text-sm font-semibold text-ink">
                {runtime.completed_jobs ?? 0} of {runtime.total_jobs ?? 0} jobs complete
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stroke/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal via-sky to-amber transition-[width] duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {visibleEntries.map((entry) => {
              const statusClasses = resolveQueueStatusClasses(entry.status)
              return (
                <article
                  key={`${entry.index}-${entry.label}`}
                  className={[
                    'relative overflow-hidden rounded-[20px] border p-4',
                    statusClasses.card,
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'absolute inset-y-0 left-0 w-1.5 rounded-l-[20px]',
                      statusClasses.rail,
                    ].join(' ')}
                  />
                  <div className="flex min-w-0 items-start justify-between gap-4 pl-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted">
                        Job {entry.index + 1}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-ink">
                        {entry.subjectLabel}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                        {entry.modeLabel}
                      </p>
                    </div>
                    <span
                      className={[
                        'inline-flex shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                        statusClasses.badge,
                      ].join(' ')}
                    >
                      {formatQueueStatusLabel(entry.status)}
                    </span>
                  </div>
                  <p className="mt-4 pl-3 text-sm leading-6 text-muted">
                    {entry.description}
                  </p>
                </article>
              )
            })}
          </div>

          {maxVisibleJobs !== null && visibleEntries.length < queueEntries.length ? (
            <p className="text-sm leading-6 text-muted">
              Showing {visibleEntries.length} of {queueEntries.length} jobs around the
              current queue position. Open the Training page for the full runtime view.
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
          <p className="text-sm font-semibold text-ink">
            {loading ? 'Loading local-training runtime...' : 'No runtime snapshot yet.'}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {loading
              ? 'The backend is still sending the first training-report payload.'
              : 'Once the backend starts or records a local-training run, the queue order will appear here.'}
          </p>
        </div>
      )}

      {error ? (
        <div className="rounded-[18px] border border-amber/30 bg-amber/10 px-4 py-3 text-sm leading-6 text-muted">
          <p>{error}</p>
          {hint ? <p className="mt-2 text-xs leading-5 text-muted">{hint}</p> : null}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry the local-training runtime request."
              className="mt-4 rounded-full border border-amber/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10"
            >
              Retry runtime
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
