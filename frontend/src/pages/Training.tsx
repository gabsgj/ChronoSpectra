import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { apiClient } from '../api/client'
import { DriftChart } from '../components/charts/DriftChart'
import { LossCurveChart } from '../components/charts/LossCurveChart'
import { LiveStockSelector } from '../components/live/LiveStockSelector'
import { FeatureAblationReportPanel } from '../components/training/FeatureAblationReportPanel'
import { LocalTrainingQueuePanel } from '../components/training/LocalTrainingQueuePanel'
import { RecentTrainingResultsPanel } from '../components/training/RecentTrainingResultsPanel'
import { RetrainingTimeline } from '../components/training/RetrainingTimeline'
import { ExchangeBadge } from '../components/ui/ExchangeBadge'
import { MetricCard } from '../components/ui/MetricCard'
import { ModelModeBadge } from '../components/ui/ModelModeBadge'
import { PageGuide } from '../components/ui/PageGuide'
import {
  appConfig,
  defaultStockId,
  getStockById,
} from '../config/stocksConfig'
import { useSharedTrainingReports } from '../contexts/SharedTrainingReportsContext'
import { useFeatureAblationReport } from '../hooks/useFeatureAblationReport'
import { formatApiError } from '../hooks/formatApiError'
import { useRetrainingLogs } from '../hooks/useRetrainingLogs'
import { useRetrainingProgress } from '../hooks/useRetrainingProgress'
import { useRetrainingStatus } from '../hooks/useRetrainingStatus'
import { useTrainingReportDetail } from '../hooks/useTrainingReportDetail'
import type {
  ColabArtifactImportResponse,
  FeatureAblationImportResponse,
  ModelMode,
  ThemeMode,
  TrainingEpochMetrics,
  VariantModelMode,
} from '../types'

const resolveTheme = (): ThemeMode => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const formatValue = (
  value: number | null | undefined,
  options?: { digits?: number; suffix?: string },
) => {
  if (typeof value !== 'number') {
    return 'Unavailable'
  }
  return `${value.toFixed(options?.digits ?? 2)}${options?.suffix ?? ''}`
}

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 'Unavailable'
  }
  return new Date(value).toLocaleString()
}

const resolveNotebookModes = (mode: ModelMode) => {
  if (mode === 'both') {
    return ['per_stock', 'unified', 'unified_with_embeddings', 'both'] as const
  }
  return [mode] as const
}

const TRAINING_RUNTIME_POLL_MS = 15_000
const IS_DEVELOPMENT_APP = __APP_ENV__ === 'development'

export default function Training() {
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
    <TrainingContent
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

interface TrainingContentProps {
  stock: NonNullable<ReturnType<typeof getStockById>>
  setStockId: (stockId: string) => void
}

const TrainingContent = ({ stock, setStockId }: TrainingContentProps) => {
  const theme = resolveTheme()
  const reportDetail = useTrainingReportDetail(stock.id)
  const trainingReports = useSharedTrainingReports()
  const retrainingLogs = useRetrainingLogs()
  const retrainingStatus = useRetrainingStatus()
  const retrainingProgress = useRetrainingProgress(stock.id)
  const [confirmingRetrain, setConfirmingRetrain] = useState(false)
  const [downloadingMode, setDownloadingMode] = useState<ModelMode | null>(null)
  const [downloadingAblationNotebook, setDownloadingAblationNotebook] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [handledRunId, setHandledRunId] = useState<string | null>(null)
  const [artifactBundle, setArtifactBundle] = useState<File | null>(null)
  const [artifactImportLoading, setArtifactImportLoading] = useState(false)
  const [artifactImportError, setArtifactImportError] = useState<string | null>(null)
  const [artifactImportHint, setArtifactImportHint] = useState<string | null>(null)
  const [artifactImportResult, setArtifactImportResult] = useState<ColabArtifactImportResponse | null>(null)
  const [featureAblationBundle, setFeatureAblationBundle] = useState<File | null>(null)
  const [featureAblationImportLoading, setFeatureAblationImportLoading] = useState(false)
  const [featureAblationImportError, setFeatureAblationImportError] = useState<string | null>(null)
  const [featureAblationImportHint, setFeatureAblationImportHint] = useState<string | null>(null)
  const [featureAblationImportResult, setFeatureAblationImportResult] = useState<FeatureAblationImportResponse | null>(null)
  const artifactInputRef = useRef<HTMLInputElement | null>(null)
  const featureAblationInputRef = useRef<HTMLInputElement | null>(null)

  const retrainingEntries = useMemo(() => {
    return [...(retrainingLogs.data?.retrain_history ?? [])]
      .filter((entry) => entry.stock_id === stock.id)
      .reverse()
  }, [retrainingLogs.data?.retrain_history, stock.id])
  const stockStatus = retrainingStatus.data?.stocks.find((entry) => {
    return entry.stock_id === stock.id
  })
  const liveEpochHistory = useMemo<TrainingEpochMetrics[]>(() => {
    return retrainingProgress.events
      .filter((event) => event.event === 'epoch' && event.stock_id === stock.id)
      .map((event) => ({
        epoch: event.epoch ?? 0,
        train_loss: event.train_loss ?? 0,
        val_loss: event.val_loss ?? 0,
      }))
      .filter((event) => event.epoch > 0)
  }, [retrainingProgress.events, stock.id])
  const latestEpoch = liveEpochHistory.at(-1)
  const notebookModes = resolveNotebookModes(appConfig.model_mode)
  const trainingRuntime = trainingReports.data?.runtime ?? null
  const ablationMode: VariantModelMode = appConfig.model_mode === 'both'
    ? 'per_stock'
    : appConfig.model_mode
  const featureAblation = useFeatureAblationReport(stock.id, ablationMode)

  const refreshSelectedReport = useEffectEvent(() => {
    reportDetail.retry()
  })

  useEffect(() => {
    const runId = retrainingProgress.runInfo?.run_id
    if (retrainingProgress.status !== 'completed' || !runId || handledRunId === runId) {
      return
    }
    reportDetail.retry()
    retrainingLogs.retry()
    retrainingStatus.retry()
    setHandledRunId(runId)
  }, [
    handledRunId,
    reportDetail,
    retrainingLogs,
    retrainingProgress.runInfo?.run_id,
    retrainingProgress.status,
    retrainingStatus,
  ])

  useEffect(() => {
    if (!trainingRuntime?.is_running) {
      return
    }

    const intervalId = window.setInterval(() => {
      refreshSelectedReport()
    }, TRAINING_RUNTIME_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [trainingRuntime?.is_running])

  const handleNotebookDownload = async (mode: ModelMode) => {
    setDownloadingMode(mode)
    setDownloadError(null)
    setDownloadMessage(null)
    try {
      const response = await apiClient.downloadNotebook(mode)
      const objectUrl = window.URL.createObjectURL(response.blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = response.filename ?? `chronospectra_${mode}_training.ipynb`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(objectUrl)
      setDownloadMessage(
        `${response.filename ?? `chronospectra_${mode}_training.ipynb`} downloaded.`,
      )
    } catch (error) {
      const formattedError = formatApiError(
        error,
        'Unable to download the notebook.',
      )
      setDownloadError(formattedError.error)
    } finally {
      setDownloadingMode(null)
    }
  }

  const handleFeatureAblationNotebookDownload = async () => {
    setDownloadingAblationNotebook(true)
    setDownloadError(null)
    setDownloadMessage(null)
    try {
      const response = await apiClient.downloadFeatureAblationNotebook(ablationMode)
      const objectUrl = window.URL.createObjectURL(response.blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = response.filename ?? `chronospectra_${ablationMode}_feature_ablation.ipynb`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(objectUrl)
      setDownloadMessage(
        `${response.filename ?? `chronospectra_${ablationMode}_feature_ablation.ipynb`} downloaded.`,
      )
    } catch (error) {
      const formattedError = formatApiError(
        error,
        'Unable to download the feature ablation notebook.',
      )
      setDownloadError(formattedError.error)
    } finally {
      setDownloadingAblationNotebook(false)
    }
  }

  const importColabArtifacts = async () => {
    if (!artifactBundle) {
      setArtifactImportError('Choose a Colab artifact zip before starting the import.')
      setArtifactImportHint(null)
      return
    }
    setArtifactImportLoading(true)
    setArtifactImportError(null)
    setArtifactImportHint(null)
    try {
      const result = await apiClient.importColabArtifactBundle(artifactBundle)
      setArtifactImportResult(result)
      setArtifactBundle(null)
      if (artifactInputRef.current) {
        artifactInputRef.current.value = ''
      }
      trainingReports.retry()
      reportDetail.retry()
      retrainingLogs.retry()
      retrainingStatus.retry()
      featureAblation.retry()
      setDownloadMessage('Colab artifacts imported and runtime cache cleared.')
      setDownloadError(null)
    } catch (error) {
      const formattedError = formatApiError(
        error,
        'Unable to import the Colab artifact bundle.',
      )
      setArtifactImportError(formattedError.error)
      setArtifactImportHint(formattedError.hint)
    } finally {
      setArtifactImportLoading(false)
    }
  }

  const importFeatureAblationArtifacts = async () => {
    if (!featureAblationBundle) {
      setFeatureAblationImportError(
        'Choose a feature ablation zip before starting the import.',
      )
      setFeatureAblationImportHint(null)
      return
    }
    setFeatureAblationImportLoading(true)
    setFeatureAblationImportError(null)
    setFeatureAblationImportHint(null)
    try {
      const result = await apiClient.importFeatureAblationBundle(featureAblationBundle)
      setFeatureAblationImportResult(result)
      setFeatureAblationBundle(null)
      if (featureAblationInputRef.current) {
        featureAblationInputRef.current.value = ''
      }
      featureAblation.retry()
      setDownloadMessage('Feature ablation reports imported and ready to reuse.')
      setDownloadError(null)
    } catch (error) {
      const formattedError = formatApiError(
        error,
        'Unable to import the feature ablation bundle.',
      )
      setFeatureAblationImportError(formattedError.error)
      setFeatureAblationImportHint(formattedError.hint)
    } finally {
      setFeatureAblationImportLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="card-surface space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="eyebrow">Training + Retraining</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl text-ink">{stock.display_name}</h2>
              <ExchangeBadge exchange={stock.exchange} />
              <ModelModeBadge mode={appConfig.model_mode} />
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Download training notebooks, review learning curves, and launch a
              controlled retraining run for the selected stock.
            </p>
          </div>
          <div className="space-y-2 text-right text-sm text-muted">
            <p>History window: {stock.model.training_data_years} years</p>
            <p>Prediction horizon: {stock.model.prediction_horizon_days} days</p>
            <p>Retrain interval: {stock.model.retrain_interval_days} days</p>
            <p>Last report: {formatTimestamp(reportDetail.data?.generated_at)}</p>
          </div>
        </div>

        <LiveStockSelector activeStockId={stock.id} onSelect={setStockId} />
        <PageGuide
          title="How to use the training page"
          summary="This page groups notebook downloads, retraining controls, and learning curves so you can manage model refreshes without hunting through the app."
          steps={[
            'Download a notebook first if you plan to train in Colab and want the generated training file for the current configuration.',
            'Use manual retraining only when you intentionally want the backend to refresh artifacts for one stock.',
            'Read the loss and drift charts after training to judge whether the new run actually helped.',
          ]}
          nextHref="/"
          nextLabel="Back to dashboard"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="History Window"
          value={`${stock.model.training_data_years} years`}
          detail="Current training-data fetch window configured for this stock."
          hint="This is not a hard app limit. It comes from stocks.json under this stock's model.training_data_years setting, so you can increase or reduce it per stock."
        />
        <MetricCard
          label="Latest Report MSE"
          value={formatValue(reportDetail.data?.metrics.mse)}
          detail="Most recent saved evaluation error for this stock."
          hint="The latest saved error score from the most recent completed report for this stock."
        />
        <MetricCard
          label="Drift Detected"
          value={stockStatus?.drift.drift_detected ? 'Yes' : 'No'}
          detail="Latest drift-detector status from the retraining service."
          hint="This warns you if recent real-world behavior has moved far enough from the saved baseline to justify retraining."
        />
        <MetricCard
          label="Recent Epoch"
          value={latestEpoch ? String(latestEpoch.epoch) : 'Idle'}
          detail="Newest epoch observed on the live retraining stream."
          hint="If a retraining run is active, this shows the newest training epoch already reported by the backend."
        />
        <MetricCard
          label="History Entries"
          value={String(retrainingEntries.length)}
          detail="Completed retraining records stored for this stock."
          hint="How many finished retraining runs are already saved in the retraining timeline for this stock."
        />
      </section>

      <LocalTrainingQueuePanel
        runtime={trainingRuntime}
        loading={trainingReports.isLoading}
        error={trainingReports.error}
        hint={trainingReports.hint}
        onRetry={() => {
          trainingReports.retry()
          reportDetail.retry()
        }}
        eyebrow="Local Training Runtime"
        title="Backend training queue visibility"
        summary="This panel tracks the config-driven local training run across all stocks and shared modes. It is separate from manual retraining for a single stock."
        maxVisibleJobs={null}
        headerExtras={
          <>
            <span
              className={[
                'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                appConfig.local_training.enabled
                  ? 'border-teal/35 bg-teal/10 text-teal'
                  : 'border-stroke/70 bg-card/70 text-muted',
              ].join(' ')}
            >
              {appConfig.local_training.enabled
                ? 'Local training enabled'
                : 'Local training disabled'}
            </span>
            <button
              type="button"
              onClick={() => {
                trainingReports.retry()
                reportDetail.retry()
              }}
              aria-label="Refresh local-training runtime status."
              className="rounded-full border border-teal/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10"
            >
              Refresh runtime
            </button>
          </>
        }
      />

      <RecentTrainingResultsPanel
        runtime={trainingRuntime}
        eyebrow="Recent Completed Jobs"
        title="Latest finished training jobs"
        summary="Review the most recent local-training outcomes before you move into report details, manual retraining, or notebook downloads."
        maxVisibleResults={4}
      />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="card-surface p-6">
          <p className="eyebrow">Notebook Generation</p>
          <h3 className="mt-3 text-2xl text-ink">Download Colab-ready notebooks</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            Generate Colab notebooks for the currently configured model modes
            and keep the artifact flow aligned with the training and ablation pipelines.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {notebookModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void handleNotebookDownload(mode)}
                disabled={downloadingMode !== null}
                aria-label={`Download the ${mode.replaceAll('_', ' ')} training notebook for Colab.`}
                className="rounded-full border border-teal/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10 disabled:cursor-wait disabled:opacity-60"
              >
                {downloadingMode === mode
                  ? `Downloading ${mode.replaceAll('_', ' ')}`
                  : `Download ${mode.replaceAll('_', ' ')}`}
                </button>
              ))}
            <button
              type="button"
              onClick={() => void handleFeatureAblationNotebookDownload()}
              disabled={downloadingMode !== null || downloadingAblationNotebook}
              aria-label={`Download the ${ablationMode.replaceAll('_', ' ')} feature ablation notebook for all active stocks.`}
              className="rounded-full border border-amber/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10 disabled:cursor-wait disabled:opacity-60"
            >
              {downloadingAblationNotebook
                ? `Downloading ${ablationMode.replaceAll('_', ' ')} ablation`
                : `Download ${ablationMode.replaceAll('_', ' ')} ablation`}
            </button>
          </div>

          {downloadMessage ? (
            <p className="mt-4 text-sm text-muted">{downloadMessage}</p>
          ) : null}
          {downloadError ? (
            <p className="mt-4 rounded-[18px] border border-amber/30 bg-amber/10 px-4 py-3 text-sm leading-6 text-muted">
              {downloadError}
            </p>
          ) : null}
        </article>

        <article className="card-surface p-6">
          <p className="eyebrow">Manual Retraining</p>
          <h3 className="mt-3 text-2xl text-ink">Trigger and monitor a fresh run</h3>
          <p className="mt-3 text-sm leading-7 text-muted">
            Start a fresh retraining run for this stock and follow
            epoch-by-epoch progress from the live stream.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {!confirmingRetrain ? (
              <button
                type="button"
                onClick={() => setConfirmingRetrain(true)}
                disabled={retrainingProgress.status === 'starting' || retrainingProgress.status === 'running'}
                aria-label={`Prepare a new retraining run for ${stock.id}.`}
                className="rounded-full border border-amber/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10 disabled:cursor-wait disabled:opacity-60"
              >
                Retrain {stock.id}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingRetrain(false)
                    void retrainingProgress.start()
                  }}
                  aria-label={`Start retraining for ${stock.display_name}.`}
                  className="rounded-full border border-teal/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10"
                >
                  Confirm retraining
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRetrain(false)}
                  aria-label="Cancel the pending retraining confirmation."
                  className="rounded-full border border-stroke/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-teal/35 hover:text-teal"
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          <div className="mt-6 space-y-3 text-sm text-muted">
            <p>Status: {retrainingProgress.status.replaceAll('_', ' ')}</p>
            <p>Run id: {retrainingProgress.runInfo?.run_id ?? 'Waiting'}</p>
            <p>Started at: {formatTimestamp(retrainingProgress.runInfo?.started_at)}</p>
            <p>
              Latest losses: train {formatValue(latestEpoch?.train_loss)} | val{' '}
              {formatValue(latestEpoch?.val_loss)}
            </p>
          </div>

          {retrainingProgress.error ? (
            <p className="mt-4 rounded-[18px] border border-amber/30 bg-amber/10 px-4 py-3 text-sm leading-6 text-muted">
              {retrainingProgress.error}
              {retrainingProgress.hint ? ` ${retrainingProgress.hint}` : ''}
            </p>
          ) : null}
        </article>
      </section>

      {IS_DEVELOPMENT_APP ? (
        <section className="card-surface space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Development Artifact Import</p>
              <h3 className="mt-2 text-2xl text-ink">Upload Colab result bundle</h3>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                Upload the zip exported from Drive after a Colab run. The backend imports
                checkpoints, scalers, and reports into the expected folders, then clears the
                in-memory runtime cache without leaving temp extraction files behind.
              </p>
            </div>
            <span className="inline-flex rounded-full border border-teal/35 bg-teal/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal">
              APP_ENV {__APP_ENV__}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-[22px] border border-stroke/70 bg-card/65 p-5">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">Training artifact bundle</p>
                <label className="block text-sm font-semibold text-ink" htmlFor="colab-artifact-bundle">
                  Colab zip bundle
                </label>
                <input
                  id="colab-artifact-bundle"
                  ref={artifactInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    setArtifactImportError(null)
                    setArtifactImportHint(null)
                    setArtifactImportResult(null)
                    setArtifactBundle(event.target.files?.[0] ?? null)
                  }}
                  className="block w-full rounded-[18px] border border-stroke/70 bg-card/70 px-4 py-3 text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-teal/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-teal"
                />
                <p className="text-sm text-muted">
                  Selected bundle: {artifactBundle?.name ?? 'None'}
                </p>
                <button
                  type="button"
                  onClick={() => void importColabArtifacts()}
                  disabled={artifactImportLoading}
                  className="rounded-full border border-teal/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10 disabled:cursor-wait disabled:opacity-60"
                  aria-label="Import Colab artifacts from the selected zip bundle."
                >
                  {artifactImportLoading ? 'Importing bundle...' : 'Import zip bundle'}
                </button>
              </div>
            </article>

            <article className="rounded-[22px] border border-stroke/70 bg-card/65 p-5">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">Feature ablation report bundle</p>
                <label className="block text-sm font-semibold text-ink" htmlFor="feature-ablation-bundle">
                  Feature ablation zip
                </label>
                <input
                  id="feature-ablation-bundle"
                  ref={featureAblationInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    setFeatureAblationImportError(null)
                    setFeatureAblationImportHint(null)
                    setFeatureAblationImportResult(null)
                    setFeatureAblationBundle(event.target.files?.[0] ?? null)
                  }}
                  className="block w-full rounded-[18px] border border-stroke/70 bg-card/70 px-4 py-3 text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-amber/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-amber"
                />
                <p className="text-sm text-muted">
                  Selected bundle: {featureAblationBundle?.name ?? 'None'}
                </p>
                <button
                  type="button"
                  onClick={() => void importFeatureAblationArtifacts()}
                  disabled={featureAblationImportLoading}
                  className="rounded-full border border-amber/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10 disabled:cursor-wait disabled:opacity-60"
                  aria-label="Import saved feature ablation reports from the selected zip bundle."
                >
                  {featureAblationImportLoading ? 'Importing ablation...' : 'Import ablation zip'}
                </button>
              </div>
            </article>
          </div>

          {artifactImportError ? (
            <p className="rounded-[18px] border border-amber/30 bg-amber/10 px-4 py-3 text-sm leading-6 text-muted">
              {artifactImportError}
              {artifactImportHint ? ` ${artifactImportHint}` : ''}
            </p>
          ) : null}

          {featureAblationImportError ? (
            <p className="rounded-[18px] border border-amber/30 bg-amber/10 px-4 py-3 text-sm leading-6 text-muted">
              {featureAblationImportError}
              {featureAblationImportHint ? ` ${featureAblationImportHint}` : ''}
            </p>
          ) : null}

          {artifactImportResult ? (
            <div className="grid gap-4 rounded-[22px] border border-stroke/70 bg-card/65 p-5 md:grid-cols-2">
              <div className="space-y-2 text-sm text-muted">
                <p>Imported at: {formatTimestamp(artifactImportResult.imported_at)}</p>
                <p>Cache cleared: {artifactImportResult.cache_cleared ? 'Yes' : 'No'}</p>
                <p>Modes: {artifactImportResult.imported_modes.join(', ') || 'None'}</p>
                <p>Stocks: {artifactImportResult.imported_stock_ids.join(', ') || 'None'}</p>
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>Reports: {artifactImportResult.imported_reports.length}</p>
                <p>Checkpoints: {artifactImportResult.imported_checkpoints.length}</p>
                <p>Scalers: {artifactImportResult.imported_scalers.length}</p>
                <p>
                  Aggregate report: {artifactImportResult.aggregate_report_path ?? 'Not copied'}
                </p>
              </div>
              {artifactImportResult.skipped_entries.length > 0 ? (
                <div className="md:col-span-2">
                  <p className="text-sm font-semibold text-ink">Skipped entries</p>
                  <ul className="mt-2 space-y-2 text-sm text-muted">
                    {artifactImportResult.skipped_entries.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {featureAblationImportResult ? (
            <div className="grid gap-4 rounded-[22px] border border-stroke/70 bg-card/65 p-5 md:grid-cols-2">
              <div className="space-y-2 text-sm text-muted">
                <p>Imported at: {formatTimestamp(featureAblationImportResult.imported_at)}</p>
                <p>
                  Cache cleared: {featureAblationImportResult.cache_cleared ? 'Yes' : 'No'}
                </p>
                <p>
                  Modes: {featureAblationImportResult.imported_modes.join(', ') || 'None'}
                </p>
                <p>
                  Stocks: {featureAblationImportResult.imported_stock_ids.join(', ') || 'None'}
                </p>
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>Reports: {featureAblationImportResult.imported_reports.length}</p>
                <p>
                  Aggregate report:{' '}
                  {featureAblationImportResult.aggregate_report_path ?? 'Not copied'}
                </p>
              </div>
              {featureAblationImportResult.skipped_entries.length > 0 ? (
                <div className="md:col-span-2">
                  <p className="text-sm font-semibold text-ink">Skipped entries</p>
                  <ul className="mt-2 space-y-2 text-sm text-muted">
                    {featureAblationImportResult.skipped_entries.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

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

      <LossCurveChart
        history={reportDetail.data?.history ?? []}
        liveHistory={liveEpochHistory}
        loading={reportDetail.isLoading}
        error={reportDetail.error}
        hint={reportDetail.hint}
        onRetry={reportDetail.retry}
        theme={theme}
      />

      <DriftChart
        entries={retrainingEntries}
        thresholdMse={stockStatus?.drift.threshold_mse ?? null}
        loading={retrainingLogs.isLoading || retrainingStatus.isLoading}
        error={retrainingLogs.error ?? retrainingStatus.error}
        hint={retrainingLogs.hint ?? retrainingStatus.hint}
        onRetry={() => {
          retrainingLogs.retry()
          retrainingStatus.retry()
        }}
        theme={theme}
      />

      <RetrainingTimeline entries={retrainingEntries} />
    </div>
  )
}
