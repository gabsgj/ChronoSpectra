import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { MarketIndexChart } from '../components/charts/MarketIndexChart'
import { NormalizedComparisonChart } from '../components/charts/NormalizedComparisonChart'
import { ProfitChart } from '../components/charts/ProfitChart'
import { RevenueChart } from '../components/charts/RevenueChart'
import { StockPriceChart } from '../components/charts/StockPriceChart'
import { USDINRChart } from '../components/charts/USDINRChart'
import { ExchangeBadge } from '../components/ui/ExchangeBadge'
import { MetricCard } from '../components/ui/MetricCard'
import { PageGuide } from '../components/ui/PageGuide'
import { StockSelector } from '../components/ui/StockSelector'
import { getStockById } from '../config/stocksConfig'
import { useStockData } from '../hooks/useStockData'
import type {
  DailyRangeOption,
  StockConfig,
  ThemeMode,
  TrackPoint,
} from '../types'

const DAILY_RANGE_OPTIONS: DailyRangeOption[] = ['1M', '3M', '6M', '1Y', 'MAX']

const DAILY_RANGE_TO_DAYS: Record<Exclude<DailyRangeOption, 'MAX'>, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
}

const resolveTheme = (): ThemeMode => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const filterPointsByRange = (
  points: TrackPoint[],
  range: DailyRangeOption,
) => {
  if (range === 'MAX' || points.length === 0) {
    return points
  }

  const latestTimestamp = new Date(points.at(-1)?.timestamp ?? points[0].timestamp)
  const cutoffTimestamp = new Date(latestTimestamp)
  cutoffTimestamp.setDate(
    latestTimestamp.getDate() - DAILY_RANGE_TO_DAYS[range],
  )

  return points.filter((point) => new Date(point.timestamp) >= cutoffTimestamp)
}

const formatTimestamp = (timestamp: string | undefined) => {
  if (!timestamp) {
    return 'No timestamps yet'
  }
  return new Date(timestamp).toLocaleString()
}

const formatCurrency = (value: number | null | undefined) => {
  if (typeof value !== 'number') {
    return 'Awaiting data'
  }
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

const formatPercent = (value: number | null | undefined) => {
  if (typeof value !== 'number') {
    return 'Awaiting data'
  }
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

const getLatestValue = (points: TrackPoint[]) => points.at(-1)?.value ?? null

const getWindowChange = (points: TrackPoint[]) => {
  if (points.length < 2 || points[0].value === 0) {
    return null
  }

  const firstValue = points[0]?.value ?? 0
  const lastValue = points.at(-1)?.value ?? 0
  return ((lastValue - firstValue) / firstValue) * 100
}

export default function StockDetail() {
  const { id = '' } = useParams()
  const stock = getStockById(id)
  const [dailyRange, setDailyRange] = useState<DailyRangeOption>('6M')

  if (!stock) {
    return (
      <section className="card-surface p-8">
        <p className="eyebrow">Unknown Stock</p>
        <h2 className="mt-3 text-2xl text-ink">No config entry matches {id}.</h2>
      </section>
    )
  }

  return (
    <StockDetailContent
      key={stock.id}
      stock={stock}
      dailyRange={dailyRange}
      onDailyRangeChange={setDailyRange}
    />
  )
}

interface StockDetailContentProps {
  stock: StockConfig
  dailyRange: DailyRangeOption
  onDailyRangeChange: (range: DailyRangeOption) => void
}

const StockDetailContent = ({
  stock,
  dailyRange,
  onDailyRangeChange,
}: StockDetailContentProps) => {
  const { data, error, hint, isLoading, isRefreshing, retry } = useStockData(stock.id)
  const theme = resolveTheme()
  const pricePoints = useMemo(
    () => filterPointsByRange(data?.tracks.price.points ?? [], dailyRange),
    [dailyRange, data?.tracks.price.points],
  )
  const indexPoints = useMemo(
    () => filterPointsByRange(data?.tracks.index.points ?? [], dailyRange),
    [dailyRange, data?.tracks.index.points],
  )
  const currencyPoints = useMemo(
    () => filterPointsByRange(data?.tracks.usd_inr.points ?? [], dailyRange),
    [dailyRange, data?.tracks.usd_inr.points],
  )
  const revenuePoints = useMemo(
    () => data?.tracks.revenue.points ?? [],
    [data?.tracks.revenue.points],
  )
  const profitPoints = useMemo(
    () => data?.tracks.profit.points ?? [],
    [data?.tracks.profit.points],
  )
  const lastUpdatedAt = formatTimestamp(data?.tracks.price.points.at(-1)?.timestamp)
  const priceChange = getWindowChange(pricePoints)
  const indexChange = getWindowChange(indexPoints)
  const currencyChange = getWindowChange(currencyPoints)
  const relativeComparisonSeries = useMemo(
    () =>
      [
        {
          id: stock.id,
          label: stock.display_name,
          points: pricePoints,
          color: stock.color,
        },
        {
          id: `${stock.id}-INDEX`,
          label: `${stock.exchange} Index`,
          points: indexPoints,
          color: '#2962FF',
        },
        {
          id: `${stock.id}-FX`,
          label: 'USD-INR',
          points: currencyPoints,
          color: '#F59E0B',
        },
      ].filter((series) => series.points.length > 0),
    [currencyPoints, indexPoints, pricePoints, stock.color, stock.display_name, stock.exchange, stock.id],
  )
  const fundamentalsComparisonSeries = useMemo(
    () =>
      [
        {
          id: `${stock.id}-REVENUE`,
          label: 'Revenue',
          points: revenuePoints,
          color: '#F59E0B',
        },
        {
          id: `${stock.id}-PROFIT`,
          label: 'Profit',
          points: profitPoints,
          color: stock.color,
        },
      ].filter((series) => series.points.length > 0),
    [profitPoints, revenuePoints, stock.color, stock.id],
  )

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <p className="eyebrow">Stock Detail</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl text-ink">{stock.display_name}</h2>
              <ExchangeBadge exchange={stock.exchange} />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Read this stock as one stacked story: lead with the expanded price
              curve, compare it against the index and FX backdrop, then move
              into the quarter-based fundamentals underneath.
            </p>
          </div>
          <div className="text-right text-sm text-muted">
            <p>{stock.ticker}</p>
            <p>{stock.sector}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em]">
              {isRefreshing ? 'Refreshing data' : `Updated ${lastUpdatedAt}`}
            </p>
          </div>
        </div>
        <StockSelector activeStockId={stock.id} basePath="/stock" />
        <PageGuide
          title="How to read this stock page"
          summary="This page is arranged from the most important chart to the supporting context underneath, so you can understand the stock without guessing where to look first."
          steps={[
            'Read the big price chart first. That is the main story for the selected date range.',
            'Use the normalized comparison chart to see whether the stock moved with or against the index and USD-INR backdrop.',
            'Use the revenue and profit sections last for slower quarter-based business context instead of daily market moves.',
          ]}
          nextHref={`/signal/${stock.id}`}
          nextLabel="Open signal view"
        />
      </section>

      <section className="card-surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Daily Range</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Applies to the daily charts only. Quarterly fundamentals stay on
              their reporting timeline.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {DAILY_RANGE_OPTIONS.map((option) => {
              const isActive = option === dailyRange
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onDailyRangeChange(option)}
                  aria-label={`Show the daily charts using the ${option} window.`}
                  className={[
                    'rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition',
                    isActive
                      ? 'border-teal bg-teal/12 text-teal'
                      : 'border-stroke/70 bg-card/70 text-muted hover:border-teal/35 hover:text-teal',
                  ].join(' ')}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Latest Close"
          value={formatCurrency(getLatestValue(pricePoints))}
          detail="Most recent close inside the selected shared daily range."
          hint="The newest closing price available in the current date window."
        />
        <MetricCard
          label="Range Change"
          value={formatPercent(priceChange)}
          detail="Net move for the stock across the visible daily window."
          hint="How much the stock moved from the start of the visible range to the end of it."
        />
        <MetricCard
          label="Index Change"
          value={formatPercent(indexChange)}
          detail="Broad-market move across the exact same dates."
          hint="How the reference market index moved across the same dates so you can compare stock versus market."
        />
        <MetricCard
          label="USD-INR Change"
          value={formatPercent(currencyChange)}
          detail="Currency backdrop over the same visible trading window."
          hint="How the USD-INR exchange rate changed over the same period as the stock chart."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0 xl:col-span-2">
          <StockPriceChart
            points={pricePoints}
            loading={isLoading}
            error={error}
            hint={hint}
            onRetry={retry}
            theme={theme}
          />
        </div>

        <div className="min-w-0 xl:col-span-2">
          <NormalizedComparisonChart
            series={relativeComparisonSeries}
            loading={isLoading}
            error={error}
            hint={hint}
            onRetry={retry}
            theme={theme}
          />
        </div>

        <div className="min-w-0">
          <MarketIndexChart
            points={indexPoints}
            loading={isLoading}
            error={error}
            hint={hint}
            onRetry={retry}
            theme={theme}
          />
        </div>
        <div className="min-w-0">
          <USDINRChart
            points={currencyPoints}
            loading={isLoading}
            error={error}
            hint={hint}
            onRetry={retry}
            theme={theme}
          />
        </div>

        <div className="min-w-0">
          <RevenueChart
            points={revenuePoints}
            loading={isLoading}
            error={error}
            hint={hint}
            onRetry={retry}
            theme={theme}
          />
        </div>
        <div className="min-w-0">
          <ProfitChart
            points={profitPoints}
            loading={isLoading}
            error={error}
            hint={hint}
            onRetry={retry}
            theme={theme}
          />
        </div>

        <div className="min-w-0 xl:col-span-2">
          <NormalizedComparisonChart
            series={fundamentalsComparisonSeries}
            loading={isLoading}
            error={error}
            hint={hint}
            onRetry={retry}
            theme={theme}
          />
        </div>
      </section>
    </div>
  )
}
