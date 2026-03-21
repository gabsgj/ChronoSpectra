import { activeStocks } from '../../config/stocksConfig'
import { ExchangeBadge } from '../ui/ExchangeBadge'

interface LiveStockSelectorProps {
  activeStockId: string
  onSelect: (stockId: string) => void
}

export const LiveStockSelector = ({
  activeStockId,
  onSelect,
}: LiveStockSelectorProps) => {
  return (
    <div className="flex flex-wrap gap-3">
      {activeStocks.map((stock) => {
        const isActive = stock.id === activeStockId

        return (
          <button
            key={stock.id}
            type="button"
            onClick={() => onSelect(stock.id)}
            className={[
              'card-surface basis-full p-4 text-left transition sm:min-w-[13rem] sm:basis-auto',
              isActive ? '' : 'hover:border-teal/30',
            ].join(' ')}
            aria-pressed={isActive}
            aria-label={`Load the live workspace for ${stock.display_name}.`}
            style={
              isActive
                ? {
                    borderColor: stock.color,
                    boxShadow: `0 0 0 1px ${stock.color}66`,
                  }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: stock.color }}
                  />
                  <p className="text-sm font-semibold text-ink">
                    {stock.display_name}
                  </p>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.24em] text-muted">
                  {stock.id}
                </p>
              </div>
              <ExchangeBadge exchange={stock.exchange} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-muted">
              <span>{isActive ? 'Active stream' : 'Open live workspace'}</span>
              <span className={isActive ? 'text-teal' : ''}>
                {isActive ? 'Selected' : 'View'}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
