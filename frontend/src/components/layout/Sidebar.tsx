import { NavLink } from 'react-router-dom'

import { activeStocks, appConfig } from '../../config/stocksConfig'
import { primaryNavRoutes } from '../../router/appRoutes'

export const Sidebar = () => {
  return (
    <aside className="panel-surface sticky top-4 hidden h-[calc(100svh-2rem)] min-h-0 w-72 shrink-0 overflow-y-auto p-5 lg:flex lg:flex-col lg:justify-between">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="eyebrow">Workspace</p>
          <div className="space-y-2">
            <p className="text-2xl font-semibold text-ink">{appConfig.app_name}</p>
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
              title={`${route.label}. ${route.description}`}
              className={({ isActive }) => (
                `flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                  isActive
                    ? 'border-teal bg-teal/10 text-teal'
                    : 'border-stroke/60 bg-card/70 text-ink hover:border-teal/40 hover:text-teal'
                }`
              )}
            >
              <div className="space-y-1">
                <span className="block">{route.label}</span>
                <span className="block text-xs font-normal leading-5 text-muted">
                  {route.description}
                </span>
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-muted">
                View
              </span>
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
