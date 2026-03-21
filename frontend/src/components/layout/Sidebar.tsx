import { NavLink } from 'react-router-dom'

import { activeStocks, appConfig } from '../../config/stocksConfig'
import { primaryNavRoutes } from '../../router/appRoutes'
import type { TrainingRuntimeResponse } from '../../types'

interface SidebarProps {
  trainingRuntime: TrainingRuntimeResponse | null
  trainingRuntimeError: string | null
  trainingRuntimeLoading: boolean
}

const buildTrainingRouteMeta = ({
  runtime,
  error,
  loading,
}: {
  runtime: TrainingRuntimeResponse | null
  error: string | null
  loading: boolean
}) => {
  if (runtime?.is_running) {
    return {
      badgeClass: 'border-amber/35 bg-amber/12 text-amber',
      badgeLabel: `${runtime.completed_jobs ?? 0}/${runtime.total_jobs ?? 0}`,
      detail: runtime.active_job_label ?? 'Training is active',
      emphasisClass: 'border-amber/35 bg-amber/10',
    }
  }

  if (loading && runtime === null) {
    return {
      badgeClass: 'border-stroke/70 bg-card/80 text-muted',
      badgeLabel: '...',
      detail: 'Loading local-training status',
      emphasisClass: '',
    }
  }

  if (error && runtime === null) {
    return {
      badgeClass: 'border-amber/35 bg-amber/12 text-amber',
      badgeLabel: 'Issue',
      detail: 'Runtime status unavailable',
      emphasisClass: '',
    }
  }

  if (runtime) {
    return {
      badgeClass: 'border-teal/35 bg-teal/10 text-teal',
      badgeLabel: 'Ready',
      detail: runtime.finished_at
        ? `Last run finished ${new Date(runtime.finished_at).toLocaleString()}`
        : 'No active local-training run',
      emphasisClass: '',
    }
  }

  return null
}

export const Sidebar = ({
  trainingRuntime,
  trainingRuntimeError,
  trainingRuntimeLoading,
}: SidebarProps) => {
  const trainingRouteMeta = buildTrainingRouteMeta({
    runtime: trainingRuntime,
    error: trainingRuntimeError,
    loading: trainingRuntimeLoading,
  })

  return (
    <aside className="panel-surface sticky top-4 hidden h-[calc(100svh-2rem)] min-h-0 w-72 shrink-0 overflow-y-auto p-5 lg:flex lg:flex-col lg:justify-between">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="eyebrow">Workspace</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal/25 bg-[radial-gradient(circle_at_30%_30%,rgba(0,191,165,0.28),rgba(79,124,255,0.08))]">
                <svg
                  viewBox="0 0 44 44"
                  className="h-7 w-7"
                  aria-hidden="true"
                  fill="none"
                >
                  <path
                    d="M7 31.5L15.5 24.5L22 27.5L30 16L37 11.5"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-teal"
                  />
                  <path
                    d="M8 36H36"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="text-muted"
                  />
                  <path
                    d="M11 36V20M18 36V24M25 36V18M32 36V13"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="text-muted"
                  />
                </svg>
              </div>
              <p className="text-2xl font-semibold text-ink">{appConfig.app_name}</p>
            </div>
            <p className="text-sm leading-6 text-muted">
              Forecasting, signal analysis, live monitoring, and retraining in
              one route-based workspace.
            </p>
          </div>
        </div>

        <nav className="space-y-2 pb-2">
          {primaryNavRoutes.map((route) => (
            <NavLink
              key={route.id}
              to={route.navPath}
              end={route.end}
              className={({ isActive }) => {
                const routeEmphasis =
                  route.id === 'training' && trainingRouteMeta?.emphasisClass
                    ? ` ${trainingRouteMeta.emphasisClass}`
                    : ''
                return `flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                  isActive
                    ? 'border-teal bg-teal/10 text-teal'
                    : `border-stroke/60 bg-card/70 text-ink hover:border-teal/40 hover:text-teal${routeEmphasis}`
                }`
              }}
              aria-label={`${route.label}. ${route.description}`}
            >
              <div className="space-y-1">
                <span className="block">{route.label}</span>
                <span className="block text-xs font-normal leading-5 text-muted">
                  {route.description}
                </span>
                {route.id === 'training' && trainingRouteMeta ? (
                  <span className="block text-[11px] leading-5 text-muted">
                    {trainingRouteMeta.detail}
                  </span>
                ) : null}
              </div>
              {route.id === 'training' && trainingRouteMeta ? (
                <span
                  className={[
                    'inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]',
                    trainingRouteMeta.badgeClass,
                  ].join(' ')}
                >
                  {trainingRouteMeta.badgeLabel}
                </span>
              ) : (
                <span className="text-xs uppercase tracking-[0.18em] text-muted">
                  View
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="card-surface mt-6 p-4">
        <p className="eyebrow">Coverage</p>
        <p className="mt-3 text-sm leading-6 text-muted">
          Tracking {activeStocks.length} configured stocks across dashboard,
          signal analysis, live testing, explainer, comparison, and training
          workflows.
        </p>
      </div>
    </aside>
  )
}
