import { startTransition, useEffect, useEffectEvent, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { EmbeddingPlot, type EmbeddingPoint } from '../components/charts/EmbeddingPlot'
import { ModelComparisonChart } from '../components/charts/ModelComparisonChart'
import { PredictionOverlayChart } from '../components/charts/PredictionOverlayChart'
import { RadarMetricsChart } from '../components/charts/RadarMetricsChart'
import { LiveStockSelector } from '../components/live/LiveStockSelector'
import { TrackChartCard } from '../components/charts/TrackChartCard'
import { LocalTrainingQueuePanel } from '../components/training/LocalTrainingQueuePanel'
import { ExchangeBadge } from '../components/ui/ExchangeBadge'
import { MetricCard } from '../components/ui/MetricCard'
import { ModelModeBadge } from '../components/ui/ModelModeBadge'
import { PageGuide } from '../components/ui/PageGuide'
import {
  activeStocks,
  appConfig,
  defaultStockId,
  getStockById,
} from '../config/stocksConfig'
import { useSharedTrainingReports } from '../contexts/SharedTrainingReportsContext'
import { useModelBacktest } from '../hooks/useModelBacktest'
import { useModelComparison } from '../hooks/useModelComparison'
import type {
  LivePredictionPoint,
  ModelMetricsSummary,
  ModelVariantResponse,
  ThemeMode,
  TrainingReportEntryResponse,
  TrainingResult,
  TrainingRuntimeResponse,
} from '../types'

const resolveTheme = (): ThemeMode => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const TRAINING_STATUS_POLL_MS = 15_000

const formatMetric = (
  value: number | null | undefined,
  options?: {
    digits?: number
    suffix?: string
  },
) => {
  if (typeof value !== 'number') {
    return 'Unavailable'
  }
  return `${value.toFixed(options?.digits ?? 2)}${options?.suffix ?? ''}`
}

const toOverlayPoints = (
  points: Array<{
    timestamp: string
    predicted_price: number
    actual_price: number
  }>,
): LivePredictionPoint[] => {
  return points.map((point) => ({
    timestamp: point.timestamp,
    actual: point.actual_price,
    predicted: point.predicted_price,
    spread: point.predicted_price - point.actual_price,
    prediction_mode: 'backtest',
    market_open: false,
  }))
}

const buildEmbeddingProjection = (
  reports: TrainingReportEntryResponse[],
) => {
  const maxRmse = Math.max(
    ...reports
      .map((report) => report.metrics.rmse ?? 0)
      .filter((value) => Number.isFinite(value) && value > 0),
    1,
  )
  const sectorOrder = [...new Set(activeStocks.map((stock) => stock.sector))]
  const hasEmbeddingArtifacts = reports.some((report) => {
    return report.mode === 'unified_with_embeddings'
  })

  const points: EmbeddingPoint[] = reports
    .map((report) => {
      const stock = getStockById(report.stock_id)
      if (!stock) {
        return null
      }
      const sectorIndex = sectorOrder.indexOf(stock.sector)
      const directionalAccuracy = report.metrics.directional_accuracy ?? 0.5
      const rmseScore = 1 - Math.min((report.metrics.rmse ?? maxRmse) / maxRmse, 1)
      const identifierOffset =
        stock.id.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) % 11

      return {
        id: stock.id,
        label: stock.display_name,
        sector: stock.sector,
        x: sectorIndex * 1.35 + directionalAccuracy * 0.9 + identifierOffset * 0.01,
        y: rmseScore * 1.6 - sectorIndex * 0.15 + identifierOffset * 0.015,
      }
    })
    .filter((point): point is EmbeddingPoint => point !== null)

  const sourceLabel = hasEmbeddingArtifacts
    ? 'Unified embedding artifacts are present. This view is ready for a true t-SNE projection once the backend exposes those vectors.'
    : 'Fallback layout built from sector labels and saved metrics until unified embedding vectors are available.'

  return {
    points,
    sourceLabel,
  }
}

const findRelevantTrainingResult = (
  runtime: TrainingRuntimeResponse | null | undefined,
  mode: ModelVariantResponse['mode'],
  stockId: string,
) => {
  const relevantResults = (runtime?.results ?? []).filter((result) => {
    if (result.mode !== mode) {
      return false
    }
    if (mode === 'per_stock') {
      return result.stock_id === stockId
    }
    return result.stock_id !== stockId
  })
  return relevantResults.at(-1) ?? null
}

const isVariantQueued = (
  runtime: TrainingRuntimeResponse | null | undefined,
  mode: ModelVariantResponse['mode'],
  stockId: string,
  latestResult: TrainingResult | null,
) => {
  if (!runtime?.is_running) {
    return false
  }
  const isModePlanned = runtime.planned_modes.includes(mode)
  if (!isModePlanned) {
    return false
  }
  if (latestResult) {
    return false
  }
  if (mode === 'per_stock') {
    return runtime.job_labels.includes(`${stockId} / per_stock`)
  }
  return runtime.job_labels.includes(`All stocks / ${mode}`)
}

const resolveVariantStatus = ({
  isAvailable,
  latestResult,
  mode,
  runtime,
  stockId,
}: {
  isAvailable: boolean
  latestResult: TrainingResult | null
  mode: ModelVariantResponse['mode']
  runtime: TrainingRuntimeResponse | null | undefined
  stockId: string
}) => {
  if (isAvailable) {
    return {
      detail: 'Saved artifact detected and ready for comparison.',
      label: 'Available',
      tone: 'teal' as const,
    }
  }

  const isActive =
    runtime?.is_running &&
    runtime.active_mode === mode &&
    (mode !== 'per_stock' || runtime.active_stock_id === stockId)

  if (isActive) {
    return {
      detail:
        runtime?.active_stage_detail ??
        'This mode is being trained right now. The card will switch to available after the checkpoint and report finish writing.',
      label: 'Training',
      tone: 'teal' as const,
    }
  }

  if (isVariantQueued(runtime, mode, stockId, latestResult)) {
    const completedJobs = runtime?.completed_jobs ?? runtime?.completed_stocks ?? 0
    const totalJobs = runtime?.total_jobs ?? runtime?.total_stocks ?? 0
    return {
      detail: `Queued in the current local-training run. Progress is ${completedJobs} of ${totalJobs} jobs complete.`,
      label: 'Queued',
      tone: 'amber' as const,
    }
  }

  if (latestResult?.status === 'failed') {
    return {
      detail:
        latestResult.error ??
        'The latest local-training attempt for this mode failed before artifacts were written.',
      label: 'Failed',
      tone: 'amber' as const,
    }
  }

  return {
    detail: 'No saved artifact is available for this mode yet.',
    label: 'Missing',
    tone: 'amber' as const,
  }
}

const VARIANT_EXPLAINERS: Array<{
  detail: string
  mode: ModelVariantResponse['mode']
  title: string
}> = [
  {
    mode: 'per_stock',
    title: 'Per-stock CNN',
    detail:
      'Dedicated weights per ticker. This is the most specialized option and usually the first trained artifact available in the project.',
  },
  {
    mode: 'unified',
    title: 'Unified CNN',
    detail:
      'One shared model across all active stocks. It trades some specialization for a simpler deployment surface and shared learning.',
  },
  {
    mode: 'unified_with_embeddings',
    title: 'Unified + embeddings',
    detail:
      'The comparative target architecture. Stock identity vectors let a shared model keep per-ticker nuance without maintaining a full checkpoint per stock.',
  },
]

export default function ModelComparison() {
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
    <ModelComparisonContent
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

interface ModelComparisonContentProps {
  stock: NonNullable<ReturnType<typeof getStockById>>
  setStockId: (stockId: string) => void
}

const ModelComparisonContent = ({
  stock,
  setStockId,
}: ModelComparisonContentProps) => {
  const theme = resolveTheme()
  const comparison = useModelComparison(stock.id)
  const backtest = useModelBacktest(stock.id, 90)
  const reports = useSharedTrainingReports()
  const trainingRuntime = reports.data?.runtime ?? null

  const refreshComparison = useEffectEvent(() => {
    comparison.retry()
  })

  useEffect(() => {
    if (!trainingRuntime?.is_running) {
      return
    }

    const intervalId = window.setInterval(() => {
      refreshComparison()
    }, TRAINING_STATUS_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [trainingRuntime?.is_running])

  const overlayPoints = useMemo(() => {
    return toOverlayPoints(backtest.data?.points ?? [])
  }, [backtest.data?.points])
  const bestVariant = comparison.data?.variants.find((variant) => {
    return variant.mode === comparison.data?.best_available_mode
  })
  const embeddingProjection = useMemo(() => {
    return buildEmbeddingProjection(reports.data?.reports ?? [])
  }, [reports.data?.reports])
  const variantCards = useMemo(() => {
    return VARIANT_EXPLAINERS.map((variant) => {
      const liveVariant = comparison.data?.variants.find((candidate) => {
        return candidate.mode === variant.mode
      })
      return {
        ...variant,
        liveVariant,
        latestTrainingResult: findRelevantTrainingResult(
          trainingRuntime,
          variant.mode,
          stock.id,
        ),
      }
    })
  }, [comparison.data?.variants, stock.id, trainingRuntime])

  const configuredMode = comparison.data?.configured_prediction_mode ?? appConfig.model_mode
  const backtestMetrics = backtest.data?.metrics

  return (
    <div className="space-y-8">
      <section className="card-surface space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="eyebrow">Model Comparison</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl text-ink">{stock.display_name}</h2>
              <ExchangeBadge exchange={stock.exchange} />
              <ModelModeBadge mode={configuredMode} />
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Review available model variants, compare saved metrics, and
              inspect recent predicted-versus-actual behavior for the selected
              stock.
            </p>
          </div>
          <div className="space-y-2 text-right text-sm text-muted">
            <p>Ticker: {stock.ticker}</p>
            <p>Sector: {stock.sector}</p>
            <p>
              {comparison.isRefreshing || backtest.isRefreshing
                ? 'Refreshing comparison data'
                : `Configured mode: ${configuredMode.replaceAll('_', ' ')}`}
            </p>
          </div>
        </div>

        <LiveStockSelector activeStockId={stock.id} onSelect={setStockId} />
        <PageGuide
          title="How to compare models without getting lost"
          summary="This page helps you answer two simple questions: which model is available, and which one seems strongest for the selected stock."
          steps={[
            'Start with the top metric cards to see the best available mode and its main error metrics.',
            'Use the variant cards and comparison charts next to compare modes side by side instead of reading raw files.',
            'Finish with the overlay chart to see what those metrics looked like on recent predicted-versus-actual history.',
          ]}
          nextHref="/training"
          nextLabel="Open training tools"
        />
      </section>

      <LocalTrainingQueuePanel
        runtime={trainingRuntime}
        loading={reports.isLoading}
        error={reports.error}
        hint={reports.hint}
        onRetry={() => {
          reports.retry()
          comparison.retry()
        }}
        title="Why a variant may still look unavailable"
        summary="If a shared model card is not available yet, check this queue first. It shows whether the backend is still training the shared variants, has already completed them, or has not reached that job yet."
        maxVisibleJobs={3}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Best Available Mode"
          value={comparison.data?.best_available_mode?.replaceAll('_', ' ') ?? 'Awaiting artifacts'}
          detail="Lowest saved MSE among the variants currently available."
          hint="The strongest saved model variant the app can actually use right now for this stock."
        />
        <MetricCard
          label="Best MSE"
          value={formatMetric(bestVariant?.metrics?.mse)}
          detail="Best saved evaluation error across the available variants."
          hint="Mean squared error for the strongest available model. Lower is better."
        />
        <MetricCard
          label="Directional Accuracy"
          value={formatMetric(bestVariant?.metrics?.directional_accuracy, {
            digits: 3,
          })}
          detail="Share of prediction points with the correct direction."
          hint="How often the saved model predicted up versus down correctly, even if the exact price was off."
        />
        <MetricCard
          label="Backtest Samples"
          value={String(backtest.data?.returned_points ?? 0)}
          detail="Recent evaluation points shown in the overlay chart."
          hint="How many recent saved prediction points are shown in the overlay chart below."
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {variantCards.map(
          ({ detail, latestTrainingResult, liveVariant, mode, title }) => {
          const metrics: ModelMetricsSummary | null | undefined = liveVariant?.metrics
          const isAvailable = liveVariant?.available ?? false
          const variantStatus = resolveVariantStatus({
            isAvailable,
            latestResult: latestTrainingResult,
            mode,
            runtime: trainingRuntime,
            stockId: stock.id,
          })
          return (
            <article key={mode} className="card-surface min-w-0 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Variant</p>
                  <h3 className="mt-3 text-2xl text-ink">{title}</h3>
                </div>
                <span
                  className={[
                    'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                    variantStatus.tone === 'teal'
                      ? 'border-teal/35 bg-teal/10 text-teal'
                      : 'border-amber/35 bg-amber/12 text-amber',
                  ].join(' ')}
                >
                  {variantStatus.label}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted">{detail}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">MSE</p>
                  <p className="mt-2 text-lg font-semibold text-ink">
                    {formatMetric(metrics?.mse)}
                  </p>
                </div>
                <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Direction
                  </p>
                  <p className="mt-2 text-lg font-semibold text-ink">
                    {formatMetric(metrics?.directional_accuracy, { digits: 3 })}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-6 text-muted">
                {liveVariant?.report_path
                  ? `Report: ${liveVariant.report_path}`
                  : variantStatus.detail}
              </p>
            </article>
          )
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ModelComparisonChart
          variants={comparison.data?.variants ?? []}
          loading={comparison.isLoading}
          error={comparison.error}
          hint={comparison.hint}
          onRetry={comparison.retry}
          theme={theme}
        />
        <RadarMetricsChart
          variants={comparison.data?.variants ?? []}
          loading={comparison.isLoading}
          error={comparison.error}
          hint={comparison.hint}
          onRetry={comparison.retry}
          theme={theme}
        />
      </section>

      <TrackChartCard
        title="Prediction Overlay"
        detail="This overlay comes from saved backtest history. It compares actual and predicted closes over recent evaluation points, so you can see where the error metrics came from instead of treating them as abstract scores."
        loading={backtest.isLoading}
        empty={overlayPoints.length === 0}
        error={backtest.error}
        hint={backtest.hint}
        onRetry={backtest.retry}
        downloadFileBase="model-backtest-overlay"
        exportRows={overlayPoints.map((point) => ({
          actual: Number(point.actual.toFixed(4)),
          predicted: Number(point.predicted.toFixed(4)),
          prediction_mode: point.prediction_mode,
          spread: Number(point.spread.toFixed(4)),
          timestamp: point.timestamp,
        }))}
        exportJson={backtest.data}
        expandedChildren={
          <PredictionOverlayChart
            points={overlayPoints}
            theme={theme}
            chartHeightClass="h-[28rem]"
          />
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>RMSE {formatMetric(backtestMetrics?.rmse)}</span>
            <span>MAPE {formatMetric(backtestMetrics?.mape, { suffix: '%' })}</span>
            <span>{backtest.data?.returned_points ?? 0} saved backtest points</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Recent window
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Hover the chart to inspect exact predicted, actual, and spread
                values at each saved backtest point.
              </p>
            </div>
            <div className="rounded-[18px] border border-stroke/70 bg-card/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                What to trust
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Use this view to judge shape, bias, and spread over time. The
                metric cards above compress the same history into one number.
              </p>
            </div>
          </div>

          <PredictionOverlayChart points={overlayPoints} theme={theme} />
        </div>
      </TrackChartCard>

      <EmbeddingPlot
        points={embeddingProjection.points}
        loading={reports.isLoading}
        error={reports.error}
        hint={reports.hint}
        onRetry={reports.retry}
        theme={theme}
        sourceLabel={embeddingProjection.sourceLabel}
      />
    </div>
  )
}
