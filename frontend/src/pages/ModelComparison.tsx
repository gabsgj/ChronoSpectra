import { startTransition, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { EmbeddingPlot, type EmbeddingPoint } from '../components/charts/EmbeddingPlot'
import { ModelComparisonChart } from '../components/charts/ModelComparisonChart'
import { PredictionOverlayChart } from '../components/charts/PredictionOverlayChart'
import { RadarMetricsChart } from '../components/charts/RadarMetricsChart'
import { LiveStockSelector } from '../components/live/LiveStockSelector'
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
import { useModelBacktest } from '../hooks/useModelBacktest'
import { useModelComparison } from '../hooks/useModelComparison'
import { useTrainingReports } from '../hooks/useTrainingReports'
import type {
  LivePredictionPoint,
  ModelMetricsSummary,
  ModelVariantResponse,
  ThemeMode,
  TrainingReportEntryResponse,
} from '../types'

const resolveTheme = (): ThemeMode => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

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
  const reports = useTrainingReports()

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
      }
    })
  }, [comparison.data?.variants])

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

      <section className="grid gap-4 xl:grid-cols-3">
        {variantCards.map(({ detail, liveVariant, mode, title }) => {
          const metrics: ModelMetricsSummary | null | undefined = liveVariant?.metrics
          const isAvailable = liveVariant?.available ?? false
          return (
            <article key={mode} className="card-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Variant</p>
                  <h3 className="mt-3 text-2xl text-ink">{title}</h3>
                </div>
                <span
                  className={[
                    'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                    isAvailable
                      ? 'border-teal/35 bg-teal/10 text-teal'
                      : 'border-amber/35 bg-amber/12 text-amber',
                  ].join(' ')}
                >
                  {isAvailable ? 'Available' : 'Missing'}
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
                  : liveVariant?.error?.hint ?? 'No saved artifact is available for this mode yet.'}
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

      <section className="card-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Prediction Overlay</p>
            <h3 className="mt-3 text-2xl text-ink">Latest saved backtest window</h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              This overlay comes from the saved prediction history and lets us
              compare actual and predicted price movement over the most recent
              evaluation points for the selected stock.
            </p>
          </div>
          <div className="rounded-[22px] border border-stroke/70 bg-card/70 px-5 py-4 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">RMSE</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {formatMetric(backtestMetrics?.rmse)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              MAPE {formatMetric(backtestMetrics?.mape, { suffix: '%' })}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <PredictionOverlayChart points={overlayPoints} theme={theme} />
        </div>
      </section>

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
