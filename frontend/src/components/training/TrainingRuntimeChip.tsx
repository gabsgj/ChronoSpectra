import { Link } from 'react-router-dom'

import type { TrainingRuntimeResponse } from '../../types'

interface TrainingRuntimeChipProps {
  runtime: TrainingRuntimeResponse | null
  loading?: boolean
  error?: string | null
  className?: string
  compact?: boolean
  showWhenIdle?: boolean
}

const formatModeLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Waiting'
  }
  return value.replaceAll('_', ' ')
}

const formatStageLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Waiting'
  }
  return value.replaceAll('_', ' ')
}

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 'Unavailable'
  }
  return new Date(value).toLocaleString()
}

const resolveStatusClasses = ({
  error,
  isRunning,
  loading,
}: {
  error: string | null
  isRunning: boolean
  loading: boolean
}) => {
  if (error) {
    return {
      accent: 'bg-amber',
      card: 'border-amber/30 bg-amber/10',
      progress: 'border-amber/35 bg-amber/12 text-amber',
    }
  }
  if (isRunning) {
    return {
      accent: 'bg-sky',
      card: 'border-sky/30 bg-sky/10',
      progress: 'border-sky/35 bg-sky/12 text-sky',
    }
  }
  if (loading) {
    return {
      accent: 'bg-stroke',
      card: 'border-stroke/70 bg-card/70',
      progress: 'border-stroke/70 bg-card/80 text-muted',
    }
  }
  return {
    accent: 'bg-teal',
    card: 'border-teal/25 bg-teal/8',
    progress: 'border-teal/35 bg-teal/10 text-teal',
  }
}

export const TrainingRuntimeChip = ({
  runtime,
  loading = false,
  error = null,
  className,
  compact = false,
  showWhenIdle = true,
}: TrainingRuntimeChipProps) => {
  const isRunning = Boolean(runtime?.is_running)
  const shouldRender =
    isRunning || Boolean(error) || loading || (showWhenIdle && runtime !== null)

  if (!shouldRender) {
    return null
  }

  const statusClasses = resolveStatusClasses({
    error,
    isRunning,
    loading: loading && runtime === null,
  })

  let headline = 'Training idle'
  let detail =
    runtime?.finished_at
      ? `Last finished ${formatTimestamp(runtime.finished_at)}.`
      : 'No active local-training run is in progress.'

  if (loading && runtime === null) {
    headline = 'Loading training status'
    detail = 'Waiting for the first local-training runtime snapshot.'
  } else if (error && runtime === null) {
    headline = 'Training status unavailable'
    detail = error
  } else if (isRunning && runtime) {
    headline = `${formatModeLabel(runtime.active_mode)} training`
    detail =
      runtime.active_stage_detail ??
      `${runtime.active_job_label ?? 'Starting next job'} | ${formatStageLabel(runtime.active_stage)}`
  }

  return (
    <div
      className={[
        'flex min-w-0 items-center justify-between gap-3 rounded-[20px] border px-4 py-3',
        statusClasses.card,
        className ?? '',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={[
            'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
            statusClasses.accent,
          ].join(' ')}
        />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Local training
          </p>
          <p className={compact ? 'mt-1 text-sm font-semibold text-ink' : 'mt-1 text-sm font-semibold text-ink'}>
            {headline}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {detail}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {runtime ? (
          <span
            className={[
              'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
              statusClasses.progress,
            ].join(' ')}
          >
            {runtime.completed_jobs ?? 0}/{runtime.total_jobs ?? 0}
          </span>
        ) : null}
        <Link
          to="/training"
          aria-label="Open the training page and local-training runtime queue."
          className="rounded-full border border-stroke/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-teal/35 hover:text-teal"
        >
          Open
        </Link>
      </div>
    </div>
  )
}
