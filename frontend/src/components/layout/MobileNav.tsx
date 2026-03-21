import { NavLink } from 'react-router-dom'

import { primaryNavRoutes } from '../../router/appRoutes'

export const MobileNav = () => {
  return (
    <nav
      aria-label="Primary navigation"
      className="panel-surface flex gap-3 overflow-x-auto px-4 py-4 lg:hidden"
    >
      {primaryNavRoutes.map((route) => (
        <NavLink
          key={route.id}
          to={route.navPath}
          end={route.end}
          title={`${route.label}. ${route.description}`}
          className={({ isActive }) =>
            [
              'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition',
              isActive
                ? 'border-teal bg-teal/12 text-teal'
                : 'border-stroke/60 bg-card/75 text-ink hover:border-teal/40 hover:text-teal',
            ].join(' ')
          }
        >
          {route.label}
        </NavLink>
      ))}
    </nav>
  )
}
