import { startTransition, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { LivePredictionChart } from '../components/charts/LivePredictionChart'
import { LivePredictionsTable } from '../components/live/LivePredictionsTable'
import { LiveStockSelector } from '../components/live/LiveStockSelector'
import { ExchangeBadge } from '../components/ui/ExchangeBadge'
import { MarketStatusBadge } from '../components/ui/MarketStatusBadge'
import { MetricCard } from '../components/ui/MetricCard'
import { PageGuide } from '../components/ui/PageGuide'
import { defaultStockId, getStockById } from '../config/stocksConfig'
import { useLiveMarket } from '../hooks/useLiveMarket'
import { useMarketStatus } from '../hooks/useMarketStatus'
import { usePrediction } from '../hooks/usePrediction'
import type { LiveConnectionState, ThemeMode } from '../types'

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
          setSearchParams({ stock: stockId })
        })
      }}
    />
  )
}

interface LiveTestingContentProps {
  stock: NonNullable<ReturnType<typeof getStockById>>
  setStockId: (stockId: string) => void
}

const LiveTestingContent = ({
  stock,
  setStockId,
}: LiveTestingContentProps) => {
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now())
  const theme = resolveTheme()
  const marketStatus = useMarketStatus(stock.exchange)
  const liveMarket = useLiveMarket(stock.id)
  const predictionMetrics = usePrediction(liveMarket.history)
  const effectiveMarketOpen =
    liveMarket.snapshot?.market_open ?? marketStatus.data?.market_open ?? false
  const nextOpenAt =
    liveMarket.snapshot?.next_open_at ?? marketStatus.data?.next_open_at ?? null
  const statusBadge = resolveConnectionBadge(
    liveMarket.connectionState,
    effectiveMarketOpen,
  )
  const latestPredictionMode =
    liveMarket.snapshot?.prediction_mode ?? 'Awaiting stream'
  const latestProvider =
    liveMarket.snapshot?.live_data_provider ??
    marketStatus.data?.live_data_provider ??
    'yfinance'
  const combinedError = liveMarket.error ?? marketStatus.error
  const combinedHint = marketStatus.hint
  const isChartLoading =
    liveMarket.snapshot === null &&
    (liveMarket.connectionState === 'connecting' ||
      marketStatus.isLoading)

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
  const spreadCopy =
    predictionMetrics.spread === null
      ? 'Waiting'
      : formatCurrency(predictionMetrics.spread)

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
            <p>Prediction mode: {latestPredictionMode}</p>
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
        <PageGuide
          title="How to use the live workspace"
          summary="This page is for monitoring the newest actual-versus-predicted readings. It keeps the main numbers, chart, and table in one place so you can read them in order."
          steps={[
            'Check the status badge first so you know whether you are looking at live market data or an after-hours snapshot.',
            'Read the four metric cards next. They summarize the latest actual price, predicted price, spread, and direction.',
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
                The page keeps the most recent snapshot visible and counts down
                to the next market open.
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
              title="Refresh the market status and the latest live snapshot."
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Actual Price"
          value={formatCurrency(predictionMetrics.actual)}
          detail={`Samples collected: ${predictionMetrics.sampleCount}`}
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
              : 'Latest after-hours reading retained until the next open.'
          }
          hint="A simple up, down, or flat interpretation of the latest prediction spread."
        />
      </section>

      <LivePredictionChart
        points={liveMarket.history}
        loading={isChartLoading}
        error={combinedError}
        hint={combinedHint}
        onRetry={() => {
          marketStatus.retry()
          liveMarket.retry()
        }}
        connectionState={liveMarket.connectionState}
        theme={theme}
      />

      <LivePredictionsTable points={liveMarket.history} />
    </div>
  )
}
