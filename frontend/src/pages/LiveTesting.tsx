import { startTransition, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { LivePredictionChart } from '../components/charts/LivePredictionChart'
import { LivePredictionsTable } from '../components/live/LivePredictionsTable'
import { FeatureAblationReportPanel } from '../components/training/FeatureAblationReportPanel'
import { LiveStockSelector } from '../components/live/LiveStockSelector'
import { ExchangeBadge } from '../components/ui/ExchangeBadge'
import { MarketStatusBadge } from '../components/ui/MarketStatusBadge'
import { MetricCard } from '../components/ui/MetricCard'
import { PageGuide } from '../components/ui/PageGuide'
import { appConfig, defaultStockId, getStockById } from '../config/stocksConfig'
import { useFeatureAblationReport } from '../hooks/useFeatureAblationReport'
import { useLiveMarket } from '../hooks/useLiveMarket'
import { useMarketStatus } from '../hooks/useMarketStatus'
import { useModelBacktest } from '../hooks/useModelBacktest'
import { usePrediction } from '../hooks/usePrediction'
import type {
  LiveConnectionState,
  LivePredictionPoint,
  ThemeMode,
  VariantModelMode,
} from '../types'

const LIVE_MODE_OPTIONS: VariantModelMode[] = [
  'per_stock',
  'unified',
  'unified_with_embeddings',
]

const isVariantModelMode = (value: string | null): value is VariantModelMode => {
  if (!value) {
    return false
  }
  return LIVE_MODE_OPTIONS.includes(value as VariantModelMode)
}

const formatCurrency = (value: number | null) => {
  if (value === null) {
    return 'Waiting'
  }
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

const formatCountdown = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return 'Waiting for the next session window'
  }
  return new Date(value).toLocaleString()
}

const resolveTheme = (): ThemeMode => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const resolveSessionKey = (timestamp: string) => {
  const parsedDate = new Date(timestamp)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }
  return [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, '0'),
    String(parsedDate.getDate()).padStart(2, '0'),
  ].join('-')
}

const resolveProjectedTargetAt = (
  timestamp: string,
  predictionHorizonDays: number | null,
  closeTimeValue: string,
) => {
  if (!predictionHorizonDays) {
    return null
  }

  const parsedDate = new Date(timestamp)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  const [hours, minutes, seconds = '00'] = closeTimeValue.split(':')
  const closeHours = Number(hours)
  const closeMinutes = Number(minutes)
  const closeSeconds = Number(seconds)
  if (
    !Number.isFinite(closeHours) ||
    !Number.isFinite(closeMinutes) ||
    !Number.isFinite(closeSeconds)
  ) {
    return null
  }

  const targetDate = new Date(parsedDate)
  let remainingSessions = Math.max(predictionHorizonDays, 1)
  while (remainingSessions > 0) {
    targetDate.setDate(targetDate.getDate() + 1)
    const dayOfWeek = targetDate.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remainingSessions -= 1
    }
  }

  targetDate.setHours(closeHours, closeMinutes, closeSeconds, 0)
  return targetDate.toISOString()
}

const toLivePredictionPoint = (
  point: {
    actual: number
    market_open: boolean
    predicted: number
    prediction_horizon_days?: number | null
    prediction_mode: string
    prediction_target_at?: string | null
    timestamp: string
  },
): LivePredictionPoint => {
  return {
    actual: point.actual,
    market_open: point.market_open,
    predicted: point.predicted,
    prediction_horizon_days: point.prediction_horizon_days ?? null,
    prediction_mode: point.prediction_mode,
    prediction_target_at: point.prediction_target_at ?? null,
    spread: point.predicted - point.actual,
    timestamp: point.timestamp,
  }
}

const resolveConnectionBadge = (
  connectionState: LiveConnectionState,
  marketOpen: boolean,
) => {
  if (!marketOpen) {
    return {
      label: 'Market Closed',
      tone: 'amber' as const,
    }
  }

  if (connectionState === 'live') {
    return {
      label: 'Live Stream',
      tone: 'teal' as const,
    }
  }

  if (connectionState === 'reconnecting') {
    return {
      label: 'Reconnecting',
      tone: 'amber' as const,
    }
  }

  if (connectionState === 'error') {
    return {
      label: 'Stream Error',
      tone: 'amber' as const,
    }
  }

  return {
    label: 'Connecting',
    tone: 'amber' as const,
  }
}

export default function LiveTesting() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedStockId = searchParams.get('stock') ?? defaultStockId
  const selectedMode = isVariantModelMode(searchParams.get('mode'))
    ? (searchParams.get('mode') as VariantModelMode)
    : null
  const stock = getStockById(selectedStockId) ?? getStockById(defaultStockId)

  if (!stock) {
    return (
      <section className="card-surface p-8">
        <p className="eyebrow">Unknown Stock</p>
        <h2 className="mt-3 text-2xl text-ink">
          No config entry matches {selectedStockId}.
        </h2>
      </section>
    )
  }

  return (
    <LiveTestingContent
      key={stock.id}
      stock={stock}
      setStockId={(stockId) => {
        startTransition(() => {
          if (selectedMode) {
            setSearchParams({ stock: stockId, mode: selectedMode })
            return
          }
          setSearchParams({ stock: stockId })
        })
      }}
      selectedMode={selectedMode}
      setMode={(mode) => {
        startTransition(() => {
          if (mode) {
            setSearchParams({ stock: stock.id, mode })
            return
          }
          setSearchParams({ stock: stock.id })
        })
      }}
    />
  )
}

interface LiveTestingContentProps {
  stock: NonNullable<ReturnType<typeof getStockById>>
  setStockId: (stockId: string) => void
  selectedMode: VariantModelMode | null
  setMode: (mode: VariantModelMode | null) => void
}

const LiveTestingContent = ({
  stock,
  setStockId,
  selectedMode,
  setMode,
}: LiveTestingContentProps) => {
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now())
  const theme = resolveTheme()
  const marketStatus = useMarketStatus(stock.exchange)
  const liveMarket = useLiveMarket(stock.id, selectedMode)
  const resolvedMode: VariantModelMode =
    selectedMode ?? (appConfig.model_mode === 'both' ? 'per_stock' : appConfig.model_mode)
  const backtest = useModelBacktest(stock.id, 90, resolvedMode)
  const ablationMode: VariantModelMode = selectedMode ?? (
    appConfig.model_mode === 'both' ? 'per_stock' : appConfig.model_mode
  )
  const featureAblation = useFeatureAblationReport(stock.id, ablationMode)
  const effectiveMarketOpen =
    liveMarket.snapshot?.market_open ?? marketStatus.data?.market_open ?? false
  const nextOpenAt =
    liveMarket.snapshot?.next_open_at ?? marketStatus.data?.next_open_at ?? null
  const statusBadge = resolveConnectionBadge(
    liveMarket.connectionState,
    effectiveMarketOpen,
  )
  const latestProvider =
    liveMarket.snapshot?.live_data_provider ??
    marketStatus.data?.live_data_provider ??
    'yfinance'

  useEffect(() => {
    if (!nextOpenAt) {
      return
    }
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(Date.now())
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [nextOpenAt])

  const latestSnapshotAt = liveMarket.snapshot?.timestamp ?? null
  const countdownSeconds = nextOpenAt
    ? Math.max(
        Math.floor(
          (new Date(nextOpenAt).getTime() - currentTimestamp) / 1000,
        ),
        0,
      )
    : 0
  const chartHistory = useMemo(() => {
    if (liveMarket.history.length === 0) {
      return []
    }

    const latestOpenPoint =
      [...liveMarket.history]
        .reverse()
        .find((point) => point.market_open) ?? liveMarket.history.at(-1) ?? null

    if (!latestOpenPoint) {
      return liveMarket.history
    }

    const sessionKey = resolveSessionKey(latestOpenPoint.timestamp)
    if (!sessionKey) {
      return liveMarket.history
    }

    const sessionPoints = liveMarket.history.filter((point) => {
      if (resolveSessionKey(point.timestamp) !== sessionKey) {
        return false
      }
      if (!effectiveMarketOpen && !point.market_open) {
        return false
      }
      return true
    })

    return sessionPoints.length > 0 ? sessionPoints : liveMarket.history
  }, [effectiveMarketOpen, liveMarket.history])
  const needsBacktestFallback = !effectiveMarketOpen && chartHistory.length < 3
  const fallbackPredictionHorizon =
    liveMarket.snapshot?.prediction_horizon_days ??
    stock.model.prediction_horizon_days
  const exchangeCloseTime = appConfig.exchanges[stock.exchange].market_hours.close

  const backtestOverlayHistory = useMemo<LivePredictionPoint[]>(() => {
    return (backtest.data?.points ?? []).map((point) => {
      return toLivePredictionPoint({
        actual: point.actual_price,
        market_open: true,
        predicted: point.predicted_price,
        prediction_horizon_days: fallbackPredictionHorizon,
        prediction_mode: 'backtest',
        prediction_target_at: resolveProjectedTargetAt(
          point.timestamp,
          fallbackPredictionHorizon,
          exchangeCloseTime,
        ),
        timestamp: point.timestamp,
      })
    })
  }, [backtest.data?.points, exchangeCloseTime, fallbackPredictionHorizon])

  const overlayPoints = useMemo(() => {
    if (effectiveMarketOpen) {
      return chartHistory
    }
    if (chartHistory.length >= 3) {
      return chartHistory
    }
    if (backtestOverlayHistory.length > 0) {
      return backtestOverlayHistory
    }
    return chartHistory
  }, [backtestOverlayHistory, chartHistory, effectiveMarketOpen])

  const overlayLatestPoint = useMemo(() => {
    if (liveMarket.snapshot) {
      return toLivePredictionPoint(liveMarket.snapshot)
    }
    return overlayPoints.at(-1) ?? null
  }, [liveMarket.snapshot, overlayPoints])
  const predictionTablePoints = useMemo(() => {
    if (liveMarket.history.length > 0) {
      return liveMarket.history
    }
    return overlayPoints
  }, [liveMarket.history, overlayPoints])
  const predictionMetrics = usePrediction(overlayPoints)
  const latestPredictionMode =
    liveMarket.snapshot?.prediction_mode ??
    overlayLatestPoint?.prediction_mode ??
    'Awaiting stream'
  const latestPredictionHorizon =
    liveMarket.snapshot?.prediction_horizon_days ??
    overlayLatestPoint?.prediction_horizon_days ??
    null
  const latestPredictionTargetAt =
    liveMarket.snapshot?.prediction_target_at ??
    overlayLatestPoint?.prediction_target_at ??
    null
  const spreadCopy =
    predictionMetrics.spread === null
      ? 'Waiting'
      : formatCurrency(predictionMetrics.spread)

  const combinedError =
    liveMarket.error ??
    marketStatus.error ??
    (needsBacktestFallback ? backtest.error : null)
  const combinedHint =
    liveMarket.hint ??
    marketStatus.hint ??
    (needsBacktestFallback ? backtest.hint : null)
  const isChartLoading =
    (liveMarket.snapshot === null &&
      (liveMarket.connectionState === 'connecting' || marketStatus.isLoading)) ||
    (needsBacktestFallback && backtest.isLoading)
  const chartHasFallbackData = overlayPoints.length > 0
  const chartError = chartHasFallbackData ? null : combinedError
  const chartHint =
    chartHasFallbackData && combinedError
      ? 'Live stream unavailable right now. Showing the saved horizon overlay instead.'
      : combinedHint

  return (
    <div className="space-y-8">
      <section className="card-surface space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="eyebrow">Live Testing</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl text-ink">{stock.display_name}</h2>
              <ExchangeBadge exchange={stock.exchange} />
              <MarketStatusBadge
                label={statusBadge.label}
                tone={statusBadge.tone}
                hint="This badge tells you whether the market is open and whether the live prediction stream is connected, reconnecting, or paused by after-hours mode."
              />
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Track the latest actual and predicted prices, connection health,
              and the after-hours countdown from one live workspace.
            </p>
          </div>
          <div className="space-y-2 text-right text-sm text-muted">
            <p>Provider: {latestProvider}</p>
            <p>
              Prediction mode:{' '}
              {selectedMode ? `${selectedMode} (forced)` : `${resolvedMode} (auto)`}
            </p>
            <p>
              {liveMarket.connectionState === 'reconnecting'
                ? `Reconnect attempt ${liveMarket.reconnectAttempt}/3`
                : `Last payload ${formatTimestamp(latestSnapshotAt)}`}
            </p>
          </div>
        </div>

        <LiveStockSelector
          activeStockId={stock.id}
          onSelect={setStockId}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Live mode
          </span>
          <button
            type="button"
            onClick={() => setMode(null)}
            className={[
              'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition',
              selectedMode === null
                ? 'border-teal/35 bg-teal/10 text-teal'
                : 'border-stroke/70 text-muted hover:border-teal/30 hover:text-teal',
            ].join(' ')}
          >
            Auto
          </button>
          {LIVE_MODE_OPTIONS.map((modeOption) => (
            <button
              key={modeOption}
              type="button"
              onClick={() => setMode(modeOption)}
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition',
                selectedMode === modeOption
                  ? 'border-teal/35 bg-teal/10 text-teal'
                  : 'border-stroke/70 text-muted hover:border-teal/30 hover:text-teal',
              ].join(' ')}
            >
              {modeOption}
            </button>
          ))}
        </div>
        <PageGuide
          title="How to use the live workspace"
          summary="This page is for monitoring the newest actual-versus-predicted readings. It keeps the main numbers, chart, and table in one place so you can read them in order."
          steps={[
            'Check the status badge first so you know whether you are looking at live market data or an after-hours snapshot.',
            'Read the metric cards next. They summarize the latest actual close, forecast, spread, direction, and forecast target date.',
            'Use the chart for trend shape and the table for exact recent values when you need detail.',
          ]}
          nextHref="/compare"
          nextLabel="Compare models"
        />
      </section>

      {!effectiveMarketOpen ? (
        <section className="card-surface space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Closed Market Fallback</p>
              <h3 className="mt-2 text-2xl text-ink">
                Countdown to the next session
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                The page keeps the most recent snapshot visible, preserves the
                saved local history, and shows the current multi-day forecast
                target instead of pretending the model predicts the next tick.
              </p>
            </div>
            <div className="rounded-[22px] border border-stroke/70 bg-card/70 px-5 py-4 text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Opens in
              </p>
              <p className="mt-2 text-3xl font-semibold text-ink">
                {formatCountdown(countdownSeconds)}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                {formatTimestamp(nextOpenAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                marketStatus.retry()
                liveMarket.retry()
              }}
              aria-label="Refresh the market status and the latest live snapshot."
              className="rounded-full border border-teal/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10"
            >
              Refresh status
            </button>
            {combinedError ? (
              <p className="text-sm text-muted">
                {combinedError}
                {combinedHint ? ` ${combinedHint}` : ''}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Actual Price"
          value={formatCurrency(predictionMetrics.actual)}
          detail={`Points shown: ${overlayPoints.length}`}
          hint="The latest real market price received by the page, plus how many live samples are currently stored in the chart."
        />
        <MetricCard
          label="Predicted Price"
          value={formatCurrency(predictionMetrics.predicted)}
          detail={`Mode: ${latestPredictionMode}`}
          hint="The latest model prediction for this stock and which model mode produced it."
        />
        <MetricCard
          label="Prediction Spread"
          value={spreadCopy}
          detail="Predicted minus actual from the latest available reading."
          hint="Positive means the model expects a higher price than the latest real reading. Negative means lower."
        />
        <MetricCard
          label="Direction"
          value={predictionMetrics.directionLabel}
          detail={
            effectiveMarketOpen
              ? 'Derived from the sign of the latest prediction spread.'
              : 'Last open-session forecast retained until the next open.'
          }
          hint="A simple up, down, or flat interpretation of the latest prediction spread."
        />
        <MetricCard
          label="Forecast Horizon"
          value={
            latestPredictionHorizon
              ? `${latestPredictionHorizon} trading days`
              : 'Waiting'
          }
          detail="This model is not producing a next-tick estimate. It predicts the configured future horizon."
          hint="The forecast horizon comes from the stock config. If this says 5 trading days, the predicted price is aimed at that target date, not the next stream update."
        />
        <MetricCard
          label="Forecast Target"
          value={latestPredictionTargetAt ? formatTimestamp(latestPredictionTargetAt) : 'Waiting'}
          detail="The estimated target session for the current forecast."
          hint="This is the session the current forecast is aimed at, based on the configured horizon and exchange calendar."
        />
      </section>

      <LivePredictionChart
        points={overlayPoints}
        latestPoint={overlayLatestPoint}
        loading={isChartLoading}
        error={chartError}
        hint={chartHint}
        onRetry={() => {
          marketStatus.retry()
          liveMarket.retry()
        }}
        connectionState={liveMarket.connectionState}
        marketOpen={effectiveMarketOpen}
        theme={theme}
      />

      <LivePredictionsTable
        points={predictionTablePoints}
        sourceLabel={
          liveMarket.history.length > 0
            ? 'Most recent streamed prediction records, newest first.'
            : 'Live stream is unavailable, so this table is showing the latest saved horizon overlay records instead.'
        }
      />

      <FeatureAblationReportPanel
        stockDisplayName={stock.display_name}
        mode={ablationMode}
        report={featureAblation.data}
        error={featureAblation.error}
        hint={featureAblation.hint}
        isLoading={featureAblation.isLoading}
        isRefreshing={featureAblation.isRefreshing}
        isRunning={featureAblation.isRunning}
        onRetry={featureAblation.retry}
        onRun={() => {
          void featureAblation.run(30)
        }}
      />
    </div>
  )
}
