import { NavLink } from 'react-router-dom'

import { primaryNavRoutes } from '../../router/appRoutes'
import type { TrainingRuntimeResponse } from '../../types'
import { TrainingRuntimeChip } from '../training/TrainingRuntimeChip'

interface MobileNavProps {
  trainingRuntime: TrainingRuntimeResponse | null
  trainingRuntimeError: string | null
  trainingRuntimeLoading: boolean
  showTrainingRuntimeChip: boolean
}

export const MobileNav = ({
  trainingRuntime,
  trainingRuntimeError,
  trainingRuntimeLoading,
  showTrainingRuntimeChip,
}: MobileNavProps) => {
  return (
    <nav
      aria-label="Primary navigation"
      className="panel-surface flex snap-x gap-3 overflow-x-auto px-4 py-4 lg:hidden [scrollbar-width:none]"
    >
      {showTrainingRuntimeChip ? (
        <TrainingRuntimeChip
          runtime={trainingRuntime}
          loading={trainingRuntimeLoading}
          error={trainingRuntimeError}
          showWhenIdle={false}
          compact
          className="min-w-[16rem] shrink-0 snap-start"
        />
      ) : null}
      {primaryNavRoutes.map((route) => (
        <NavLink
          key={route.id}
          to={route.navPath}
          end={route.end}
          className={({ isActive }) => {
            const trainingRouteEmphasis =
              route.id === 'training' && trainingRuntime?.is_running
                ? ' border-amber/35 bg-amber/10'
                : ''
            return [
              'min-w-[12.5rem] shrink-0 snap-start rounded-[22px] border px-4 py-3 transition',
              isActive
                ? 'border-teal bg-teal/12 text-teal'
                : `border-stroke/60 bg-card/75 text-ink hover:border-teal/40 hover:text-teal${trainingRouteEmphasis}`,
            ].join(' ')
          }}
          aria-label={`${route.label}. ${route.description}`}
        >
          <div className="space-y-1">
            <span className="block text-sm font-semibold">{route.label}</span>
            <span className="block text-xs leading-5 text-muted">
              {route.description}
            </span>
            {route.id === 'training' && trainingRuntime?.is_running ? (
              <span className="inline-flex rounded-full border border-amber/35 bg-amber/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-amber">
                {trainingRuntime.completed_jobs ?? 0}/{trainingRuntime.total_jobs ?? 0} running
              </span>
            ) : null}
            {route.id === 'training' && !trainingRuntime?.is_running && trainingRuntimeLoading && !trainingRuntimeError ? (
              <span className="inline-flex rounded-full border border-stroke/70 bg-card/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted">
                Loading status
              </span>
            ) : null}
          </div>
        </NavLink>
      ))}
    </nav>
  )
}
