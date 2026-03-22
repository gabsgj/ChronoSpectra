import { useEffect, useEffectEvent } from 'react'
import { Link } from 'react-router-dom'

import { NormalizedComparisonChart } from '../components/charts/NormalizedComparisonChart'
import { RecentTrainingResultsPanel } from '../components/training/RecentTrainingResultsPanel'
import { ExchangeBadge } from '../components/ui/ExchangeBadge'
import { MarketStatusBadge } from '../components/ui/MarketStatusBadge'
import { MetricCard } from '../components/ui/MetricCard'
import { ModelModeBadge } from '../components/ui/ModelModeBadge'
import { PageGuide } from '../components/ui/PageGuide'
import {
  activeStockIds,
  activeStocks,
  appConfig,
} from '../config/stocksConfig'
import { useDashboardFeatureEffects } from '../hooks/useDashboardFeatureEffects'
import { useDashboardMarketData } from '../hooks/useDashboardMarketData'
import { useExchangeStatuses } from '../hooks/useExchangeStatuses'
import { useRetrainingStatus } from '../hooks/useRetrainingStatus'
import { useSharedTrainingReports } from '../contexts/SharedTrainingReportsContext'
import type {
  FeatureEffectEntryResponse,
  MarketDataResponse,
  RetrainingStockStatusResponse,
  StockConfig,
  ThemeMode,
  TrackPoint,
  TrainingReportEntryResponse,
} from '../types'

const TRAINING_RUNTIME_POLL_MS = 15_000

const resolveTheme = (): ThemeMode => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const uniqueExchangeIds = [...new Set(activeStocks.map((stock) => stock.exchange))]

const formatCurrency = (value: number | null | undefined) => {
  if (typeof value !== 'number') {
    return 'Unavailable'
  }
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

const formatMetric = (
  value: number | null | undefined,
  options?: {
    digits?: number
    suffix?: string
  },
) => {
  if (typeof value !== 'number') {
    return 'Pending'
  }
  return `${value.toFixed(options?.digits ?? 2)}${options?.suffix ?? ''}`
}

const formatPct = (value: number | null | undefined, digits = 1) => {
  if (typeof value !== 'number') {
    return 'n/a'
  }
  return `${(value * 100).toFixed(digits)}%`
}

const formatChange = (value: number | null) => {
  if (value === null) {
    return 'Awaiting trend'
  }
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 'Awaiting snapshot'
  }
  return new Date(value).toLocaleString()
}

const formatTime = (value: string | null | undefined) => {
  if (!value) {
    return 'Unavailable'
  }
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatRelativeCountdown = (seconds: number | null | undefined) => {
  if (typeof seconds !== 'number') {
    return 'Unavailable'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

const getLatestPoint = (response: MarketDataResponse | undefined): TrackPoint | null => {
  return response?.tracks.price.points.at(-1) ?? null
}

const getWindowChange = (response: MarketDataResponse | undefined) => {
  const points = response?.tracks.price.points
  const firstPoint = points?.[0]
  const lastPoint = points?.at(-1)

  if (!firstPoint || !lastPoint || firstPoint.value === 0) {
    return null
  }

  return ((lastPoint.value - firstPoint.value) / firstPoint.value) * 100
}

const renderInlineError = (
  error: string,
  hint: string | null | undefined,
  onRetry: () => void,
) => {
  return (
    <div className="mt-5 rounded-[22px] border border-amber/30 bg-amber/10 p-4">
      <p className="text-sm font-semibold text-amber">Data request failed</p>
      <p className="mt-2 text-sm leading-6 text-muted">{error}</p>
      {hint ? (
        <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        aria-label="Retry this failed data request."
        className="mt-4 rounded-full border border-amber/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10"
      >
        Retry
      </button>
    </div>
  )
}

export default function Dashboard() {
  const theme = resolveTheme()
  const marketData = useDashboardMarketData(activeStockIds)
  const featureEffects = useDashboardFeatureEffects(activeStockIds)
  const exchangeStatuses = useExchangeStatuses(uniqueExchangeIds)
  const trainingReports = useSharedTrainingReports()
  const retrainingStatus = useRetrainingStatus()
  const trainingRuntime = trainingReports.data?.runtime ?? null

  const refreshRetrainingStatus = useEffectEvent(() => {
    retrainingStatus.retry()
  })

  useEffect(() => {
    if (!trainingRuntime?.is_running) {
      return
    }

    const intervalId = window.setInterval(() => {
      refreshRetrainingStatus()
    }, TRAINING_RUNTIME_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [trainingRuntime?.is_running])

  const reportsByStock = new Map(
    (trainingReports.data?.reports ?? []).map((report) => [report.stock_id, report]),
  )
  const retrainingByStock = new Map(
    (retrainingStatus.data?.stocks ?? []).map((entry) => [entry.stock_id, entry]),
  )

  const normalizedSeries = activeStocks
    .map((stock) => ({
      id: stock.id,
      label: stock.display_name,
      points: marketData.dataByStock[stock.id]?.tracks.price.points ?? [],
    }))
    .filter((series) => series.points.length > 0)

  const dueStocksCount = retrainingStatus.data?.stocks.filter((stock) => {
    return stock.retrain_due
  }).length ?? 0
  const driftCount = retrainingStatus.data?.stocks.filter((stock) => {
    return stock.drift.drift_detected
  }).length ?? 0
  const exchangeOpenCount = uniqueExchangeIds.filter((exchangeId) => {
    return exchangeStatuses.dataByExchange[exchangeId]?.market_open
  }).length
  const activeJobsCount = retrainingStatus.data?.runtime.active_jobs.length ?? 0
  const savedReportsCount = trainingReports.data?.reports.length ?? 0
  const anyRefreshing =
    marketData.isRefreshing ||
    featureEffects.isRefreshing ||
    exchangeStatuses.isRefreshing ||
    trainingReports.isRefreshing ||
    retrainingStatus.isRefreshing
  const refreshLabel = anyRefreshing ? 'Refreshing signals' : 'Latest snapshot ready'
  const retryAll = () => {
    marketData.retry()
    featureEffects.retry()
    exchangeStatuses.retry()
    trainingReports.retry()
    retrainingStatus.retry()
  }
  const globalErrors = [
    marketData.error,
    featureEffects.error,
    exchangeStatuses.error,
    trainingReports.error,
    retrainingStatus.error,
  ].filter((value): value is string => value !== null)
  const globalHints = [
    marketData.hint,
    featureEffects.hint,
    exchangeStatuses.hint,
    trainingReports.hint,
    retrainingStatus.hint,
  ].filter((value): value is string => Boolean(value))

  const topFeaturesByStock = activeStocks
    .map((stock) => {
      const topFeature = featureEffects.dataByStock[stock.id]?.features[0]
      if (!topFeature) {
        return null
      }
      return {
        stock,
        topFeature,
      }
    })
    .filter(
      (
        entry,
      ): entry is {
        stock: StockConfig
        topFeature: FeatureEffectEntryResponse
      } => entry !== null,
    )

  const topDriverRollup = new Map<
    string,
    {
      label: string
      count: number
      totalStrength: number
    }
  >()

  topFeaturesByStock.forEach(({ topFeature }) => {
    const current = topDriverRollup.get(topFeature.feature) ?? {
      label: topFeature.label,
      count: 0,
      totalStrength: 0,
    }
    topDriverRollup.set(topFeature.feature, {
      label: current.label,
      count: current.count + 1,
      totalStrength: current.totalStrength + (topFeature.relative_strength ?? 0),
    })
  })

  const mostCommonDriver = [...topDriverRollup.values()].sort((left, right) => {
    if (right.count === left.count) {
      return right.totalStrength - left.totalStrength
    }
    return right.count - left.count
  })[0] ?? null

  const globalFeatureLeaderboard = [...topDriverRollup.values()]
    .map((entry) => ({
      ...entry,
      averageStrength: entry.count > 0 ? entry.totalStrength / entry.count : 0,
    }))
    .sort((left, right) => {
      if (right.count === left.count) {
        return right.averageStrength - left.averageStrength
      }
      return right.count - left.count
    })
    .slice(0, 3)

  const strongestDriver = topFeaturesByStock
    .slice()
    .sort((left, right) => {
      return (right.topFeature.relative_strength ?? 0) - (left.topFeature.relative_strength ?? 0)
    })[0] ?? null

  const directionalSamples = topFeaturesByStock
    .map((entry) => entry.topFeature.directional_accuracy)
    .filter((value): value is number => typeof value === 'number')
  const averageTopDriverDirectionalAccuracy = directionalSamples.length > 0
    ? directionalSamples.reduce((sum, value) => sum + value, 0) / directionalSamples.length
    : null

  return (
    <div className="space-y-8">
      <section className="card-surface space-y-6 overflow-visible p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <p className="eyebrow">Dashboard</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl text-ink">Market pulse across every active stock</h2>
              <ModelModeBadge mode={appConfig.model_mode} />
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Monitor price action, model health, and retraining pressure
              across the active universe before drilling into an individual
              ticker.
            </p>
          </div>
          <div className="min-w-0 space-y-2 text-right text-sm text-muted">
            <p>Default transform: {appConfig.signal_processing.default_transform.toUpperCase()}</p>
            <p>
              STFT {appConfig.signal_processing.stft.window_length} /{' '}
              {appConfig.signal_processing.stft.hop_size} /{' '}
              {appConfig.signal_processing.stft.n_fft}
            </p>
            <p>{refreshLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <MarketStatusBadge
            label={exchangeOpenCount > 0 ? 'Exchange Open' : 'Exchange Closed'}
            tone={exchangeOpenCount > 0 ? 'teal' : 'amber'}
            hint="This tells you whether at least one configured exchange is currently in session."
          />
          <MarketStatusBadge
            label={dueStocksCount > 0 ? `${dueStocksCount} Retrain Due` : 'Retraining Healthy'}
            tone={dueStocksCount > 0 ? 'amber' : 'teal'}
            hint="This shows whether any stock has crossed the retraining age or drift threshold."
          />
          <MarketStatusBadge
            label={activeJobsCount > 0 ? `${activeJobsCount} Jobs Running` : 'Scheduler Idle'}
            tone={activeJobsCount > 0 ? 'amber' : 'teal'}
            hint="This tells you whether the backend is actively retraining models right now."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Tracked Stocks"
            value={String(activeStocks.length)}
            detail="Enabled names from the shared market configuration."
            hint="How many stocks are currently turned on in stocks.json and shown across the app."
          />
          <MetricCard
            label="Saved Reports"
            value={String(savedReportsCount)}
            detail="Reports available for comparison, drift checks, and review."
            hint="Training and retraining reports that already exist on disk for later analysis."
          />
          <MetricCard
            label="Drift Flags"
            value={String(driftCount)}
            detail="Stocks whose recent error is above the configured threshold."
            hint="If this number grows, the model may be getting worse on recent data and needs attention."
          />
          <MetricCard
            label="Default Horizon"
            value={`${activeStocks[0]?.model.prediction_horizon_days ?? 0}d`}
            detail="Forward prediction horizon used by the current stock set."
            hint="How far ahead the current models try to predict."
          />
        </div>

        <PageGuide
          title="Recommended first-time flow"
          summary="If this is your first time using ChronoSpectra, start broad on the dashboard, then narrow down into one stock before opening the live, model, or training tools."
          steps={[
            'Use this dashboard to see which stock looks interesting or unhealthy. Check the big normalized chart and the five stock cards first.',
            'Open Stock Detail next to read one stock clearly with larger charts for price, index, FX, revenue, and profit.',
            'Move to Signal Analysis or Live Testing once you want to understand why the model behaves the way it does or monitor current predictions.',
          ]}
          nextHref={`/stock/${activeStocks[0]?.id ?? ''}`}
          nextLabel="Open first stock"
        />

        {globalErrors.length > 0 ? (
          <div className="rounded-[22px] border border-amber/30 bg-amber/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber">
                  Some dashboard data sources are unavailable
                </p>
                <p className="text-sm leading-6 text-muted">
                  {globalErrors[0]}
                </p>
                {globalHints[0] ? (
                  <p className="text-xs leading-5 text-muted">{globalHints[0]}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={retryAll}
                aria-label="Retry every dashboard data source at once."
                className="rounded-full border border-amber/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10"
              >
                Retry all
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <RecentTrainingResultsPanel
        runtime={trainingRuntime}
        eyebrow="Latest Training Outcomes"
        title="Most recent completed runtime jobs"
        summary="These are the newest finished local-training jobs, so you can spot fresh successes or failures from the dashboard before drilling into the training route."
        maxVisibleResults={3}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Market Status</p>
            <h3 className="mt-2 text-2xl text-ink">Exchange and scheduler summary</h3>
          </div>
          <button
            type="button"
            onClick={retryAll}
            aria-label="Refresh the exchange, scheduler, report, and market data sections."
            className="rounded-full border border-stroke/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-teal/35 hover:text-teal"
          >
            Refresh dashboard
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          {uniqueExchangeIds.map((exchangeId) => {
            const exchangeStatus = exchangeStatuses.dataByExchange[exchangeId]
            const exchangeConfig = appConfig.exchanges[exchangeId]

            return (
              <article key={exchangeId} className="card-surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Exchange</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl text-ink">{exchangeId}</h3>
                      <MarketStatusBadge
                        label={exchangeStatus?.market_open ? 'Open' : 'Closed'}
                        tone={exchangeStatus?.market_open ? 'teal' : 'amber'}
                      />
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p>Provider: {exchangeStatus?.live_data_provider ?? exchangeConfig.live_data_provider}</p>
                    <p>Timezone: {exchangeStatus?.timezone ?? exchangeConfig.market_hours.timezone}</p>
                  </div>
                </div>

                {exchangeStatuses.error && !exchangeStatus ? (
                  renderInlineError(exchangeStatuses.error, exchangeStatuses.hint, exchangeStatuses.retry)
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted">Session</p>
                      <p className="mt-2 text-lg font-semibold text-ink">
                        {formatTime(exchangeStatus?.current_session_open_at)} to{' '}
                        {formatTime(exchangeStatus?.current_session_close_at)}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted">
                        Config window {exchangeConfig.market_hours.open} to{' '}
                        {exchangeConfig.market_hours.close}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted">Next Open</p>
                      <p className="mt-2 text-lg font-semibold text-ink">
                        {formatTimestamp(exchangeStatus?.next_open_at)}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted">
                        In {formatRelativeCountdown(exchangeStatus?.seconds_until_open)}
                      </p>
                    </div>
                  </div>
                )}
              </article>
            )
          })}

          <article className="card-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Retraining Engine</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h3 className="text-2xl text-ink">Scheduler status</h3>
                  <MarketStatusBadge
                    label={
                      retrainingStatus.data?.scheduler.running
                        ? 'Scheduler Running'
                        : 'Scheduler Paused'
                    }
                    tone={retrainingStatus.data?.scheduler.running ? 'teal' : 'amber'}
                  />
                </div>
              </div>
              <div className="text-right text-sm text-muted">
                <p>Check interval: {retrainingStatus.data?.scheduler.check_interval_hours ?? 'N/A'}h</p>
                <p>History entries: {retrainingStatus.data?.runtime.history_count ?? 0}</p>
              </div>
            </div>

            {retrainingStatus.error && !retrainingStatus.data ? (
              renderInlineError(retrainingStatus.error, retrainingStatus.hint, retrainingStatus.retry)
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Active jobs</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{activeJobsCount}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {activeJobsCount > 0
                      ? 'A retraining run is currently updating artifacts.'
                      : 'No manual or scheduled retrain is running right now.'}
                  </p>
                </div>
                <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Retrain due</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{dueStocksCount}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {dueStocksCount > 0
                      ? 'These stocks crossed the scheduler or drift threshold.'
                      : 'No stock currently requires a forced refresh.'}
                  </p>
                </div>
                <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Last completed check</p>
                  <p className="mt-2 text-lg font-semibold text-ink">
                    {formatTimestamp(retrainingStatus.data?.scheduler.last_check_completed_at)}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Runtime running: {retrainingStatus.data?.runtime.is_running ? 'yes' : 'no'}
                  </p>
                </div>
              </div>
            )}
          </article>
        </div>
      </section>

      <NormalizedComparisonChart
        series={normalizedSeries}
        loading={marketData.isLoading}
        error={marketData.error}
        hint={marketData.hint}
        onRetry={marketData.retry}
        theme={theme}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Drivers</p>
            <h3 className="mt-2 text-2xl text-ink">Top feature drivers by stock</h3>
          </div>
          <p className="text-sm text-muted">
            {featureEffects.missingStockIds.length > 0
              ? `Missing analysis for ${featureEffects.missingStockIds.join(', ')}`
              : 'Feature snapshots are available for each active stock'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-[20px] border border-stroke/70 bg-card/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Most common driver</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {mostCommonDriver ? mostCommonDriver.label : 'Pending'}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              {mostCommonDriver
                ? `${mostCommonDriver.count} stock${mostCommonDriver.count > 1 ? 's' : ''} have this as their top signal.`
                : 'Waiting for feature snapshots.'}
            </p>
          </article>

          <article className="rounded-[20px] border border-stroke/70 bg-card/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Strongest single driver</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {strongestDriver
                ? `${strongestDriver.topFeature.label} (${strongestDriver.stock.id})`
                : 'Pending'}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Strength {strongestDriver ? formatMetric(strongestDriver.topFeature.relative_strength, { digits: 1 }) : 'n/a'}
            </p>
          </article>

          <article className="rounded-[20px] border border-stroke/70 bg-card/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Avg directional agreement</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {formatPct(averageTopDriverDirectionalAccuracy)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Mean top-driver directional hit rate across available stocks.
            </p>
          </article>
        </div>

        <article className="rounded-[20px] border border-stroke/70 bg-card/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Global driver leaderboard</p>
            <p className="text-xs text-muted">Top 3 by prevalence</p>
          </div>
          {globalFeatureLeaderboard.length > 0 ? (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {globalFeatureLeaderboard.map((entry, index) => (
                <div key={entry.label} className="rounded-[14px] border border-stroke/60 bg-card/80 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">#{index + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{entry.label}</p>
                  <p className="mt-1 text-xs text-muted">
                    {entry.count} stock{entry.count > 1 ? 's' : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Avg strength {formatMetric(entry.averageStrength, { digits: 1 })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted">
              Waiting for enough feature snapshots to build a leaderboard.
            </p>
          )}
        </article>

        {featureEffects.error && Object.keys(featureEffects.dataByStock).length === 0 ? (
          renderInlineError(featureEffects.error, featureEffects.hint, featureEffects.retry)
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {activeStocks.map((stock) => (
            <TopFeatureCard
              key={stock.id}
              stock={stock}
              topFeature={featureEffects.dataByStock[stock.id]?.features[0]}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Stock Cards</p>
            <h3 className="mt-2 text-2xl text-ink">Five-stock monitoring grid</h3>
          </div>
          <p className="text-sm text-muted">
            {marketData.missingStockIds.length > 0
              ? `Missing snapshots for ${marketData.missingStockIds.join(', ')}`
              : 'Every enabled stock has a dashboard card'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {activeStocks.map((stock) => (
            <StockPulseCard
              key={stock.id}
              stock={stock}
              marketData={marketData.dataByStock[stock.id]}
              report={reportsByStock.get(stock.id)}
              retraining={retrainingByStock.get(stock.id)}
              marketDataError={marketData.error}
              marketDataHint={marketData.hint}
              reportsError={trainingReports.error}
              retrainingError={retrainingStatus.error}
              onRetry={retryAll}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

interface StockPulseCardProps {
  stock: StockConfig
  marketData: MarketDataResponse | undefined
  report: TrainingReportEntryResponse | undefined
  retraining: RetrainingStockStatusResponse | undefined
  marketDataError: string | null
  marketDataHint: string | null
  reportsError: string | null
  retrainingError: string | null
  onRetry: () => void
}

interface TopFeatureCardProps {
  stock: StockConfig
  topFeature: FeatureEffectEntryResponse | undefined
}

const TopFeatureCard = ({ stock, topFeature }: TopFeatureCardProps) => {
  return (
    <article className="card-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-ink">{stock.display_name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{stock.id}</p>
        </div>
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: stock.color }}
        />
      </div>

      {topFeature ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Top driver</p>
            <p className="mt-1 text-lg font-semibold text-ink">{topFeature.label}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted">
            <p>Strength {formatMetric(topFeature.relative_strength, { digits: 1 })}</p>
            <p>Corr {typeof topFeature.pearson_correlation === 'number' ? topFeature.pearson_correlation.toFixed(3) : 'n/a'}</p>
            <p>Dir {formatPct(topFeature.directional_accuracy)}</p>
          </div>
          <p className="text-xs leading-5 text-muted">{topFeature.frequency}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-[16px] border border-stroke/70 bg-card/70 p-3">
          <p className="text-xs leading-5 text-muted">Feature analysis is not available yet for this stock.</p>
        </div>
      )}

      <div className="mt-4 border-t border-stroke/60 pt-3 text-xs font-semibold uppercase tracking-[0.18em]">
        <Link
          to={`/training?stock=${stock.id}`}
          aria-label={`Open training analysis for ${stock.display_name}.`}
          className="text-teal transition hover:text-ink"
        >
          Open analysis
        </Link>
      </div>
    </article>
  )
}

const StockPulseCard = ({
  stock,
  marketData,
  report,
  retraining,
  marketDataError,
  marketDataHint,
  reportsError,
  retrainingError,
  onRetry,
}: StockPulseCardProps) => {
  const latestPoint = getLatestPoint(marketData)
  const windowChange = getWindowChange(marketData)

  return (
    <article className="card-surface flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-ink">{stock.display_name}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: stock.color }}
            />
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {stock.id} | {stock.ticker}
            </p>
          </div>
        </div>
        <ExchangeBadge exchange={stock.exchange} />
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-3xl font-semibold text-ink">
          {formatCurrency(latestPoint?.value)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <MarketStatusBadge
            label={
              windowChange === null
                ? 'Awaiting Trend'
                : windowChange >= 0
                  ? 'Trend Up'
                  : 'Trend Down'
            }
            tone={windowChange !== null && windowChange >= 0 ? 'teal' : 'amber'}
          />
          <span className="text-sm text-muted">{formatChange(windowChange)}</span>
        </div>
        <p className="text-xs leading-5 text-muted">
          Latest close: {formatTimestamp(latestPoint?.timestamp)}
        </p>
      </div>

      {marketDataError && !marketData ? (
        <div className="mt-5 rounded-[18px] border border-amber/30 bg-amber/10 p-4">
          <p className="text-sm font-semibold text-amber">Price track unavailable</p>
          <p className="mt-2 text-sm leading-6 text-muted">{marketDataError}</p>
          {marketDataHint ? (
            <p className="mt-2 text-xs leading-5 text-muted">{marketDataHint}</p>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            aria-label="Retry the missing stock card data."
            className="mt-4 rounded-full border border-amber/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Saved MSE</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {formatMetric(report?.metrics.mse)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              {reportsError
                ? reportsError
                : report?.generated_at
                  ? `Report generated ${formatTimestamp(report.generated_at)}`
                  : 'No saved report is available yet.'}
            </p>
          </div>
          <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Direction</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {formatMetric(report?.metrics.directional_accuracy, {
                digits: 3,
              })}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Saved directional accuracy from the current artifact.
            </p>
          </div>
          <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Drift</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {retraining?.drift.drift_detected ? 'Detected' : 'Clear'}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              {retrainingError
                ? retrainingError
                : typeof retraining?.drift.threshold_mse === 'number'
                  ? `Threshold ${formatMetric(retraining.drift.threshold_mse)}`
                  : 'No drift baseline is available yet.'}
            </p>
          </div>
          <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Retrain Window</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {retraining?.retrain_due ? 'Due now' : `${stock.model.retrain_interval_days} days`}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Horizon {stock.model.prediction_horizon_days} days, sector {stock.sector}.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-stroke/60 pt-4 text-xs font-semibold uppercase tracking-[0.18em]">
        <Link
          to={`/stock/${stock.id}`}
          aria-label={`Open detailed charts for ${stock.display_name}.`}
          className="text-teal transition hover:text-ink"
        >
          Open detail
        </Link>
        <Link
          to={`/live?stock=${stock.id}`}
          aria-label={`Open the live monitoring page for ${stock.display_name}.`}
          className="text-muted transition hover:text-teal"
        >
          Live view
        </Link>
      </div>
    </article>
  )
}
