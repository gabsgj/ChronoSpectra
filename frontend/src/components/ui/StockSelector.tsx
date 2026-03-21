import { NavLink } from 'react-router-dom'

import { activeStocks } from '../../config/stocksConfig'
import { ExchangeBadge } from './ExchangeBadge'

interface StockSelectorProps {
  activeStockId: string
  basePath: '/stock' | '/signal'
}

export function StockSelector({
  activeStockId,
  basePath,
}: StockSelectorProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {activeStocks.map((stock) => {
        const isActive = stock.id === activeStockId
        return (
          <NavLink
            key={stock.id}
            to={`${basePath}/${stock.id}`}
            className={`card-surface basis-full p-4 transition sm:min-w-[13rem] sm:basis-auto ${
              isActive ? 'border-teal shadow-[0_0_0_1px_rgba(0,212,170,0.45)]' : ''
            }`}
            aria-label={`Open ${stock.display_name} in ${basePath === '/stock' ? 'Stock Detail' : 'Signal Analysis'}.`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {stock.display_name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.24em] text-muted">
                  {stock.id}
                </p>
              </div>
              <ExchangeBadge exchange={stock.exchange} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-muted">
              <span>
                {basePath === '/stock' ? 'View market charts' : 'Inspect transforms'}
              </span>
              <span className={isActive ? 'text-teal' : ''}>
                {isActive ? 'Selected' : 'Open'}
              </span>
            </div>
          </NavLink>
        )
      })}
    </div>
  )
}
