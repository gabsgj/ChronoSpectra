import type { FeatureAblationReportResponse, VariantModelMode } from '../../types'

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return 'Not generated yet'
  }
  return new Date(value).toLocaleString()
}

interface FeatureAblationReportPanelProps {
  stockDisplayName: string
  mode: VariantModelMode
  report: FeatureAblationReportResponse | null
  error: string | null
  hint: string | null
  isLoading: boolean
  isRefreshing: boolean
  isRunning: boolean
  onRetry: () => void
  onRun: () => void
}

export const FeatureAblationReportPanel = ({
  stockDisplayName,
  mode,
  report,
  error,
  hint,
  isLoading,
  isRefreshing,
  isRunning,
  onRetry,
  onRun,
}: FeatureAblationReportPanelProps) => {
  return (
    <section className="card-surface space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Feature Contribution Analysis</p>
          <h3 className="mt-2 text-2xl text-ink">Channel ablation report</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
            This view shows the saved baseline-vs-channel-drop report for {stockDisplayName}. Running it
            again retrains baseline and minus-one-channel variants, so it can take several minutes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading || isRefreshing || isRunning}
            className="rounded-full border border-stroke/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-teal/35 hover:text-teal disabled:cursor-wait disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing...' : 'Reload saved report'}
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning}
            className="rounded-full border border-teal/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10 disabled:cursor-wait disabled:opacity-60"
            aria-label={`Run feature-channel ablation for ${stockDisplayName}.`}
          >
            {isRunning ? 'Running ablation...' : 'Run ablation'}
          </button>
        </div>
      </div>

      <div className="rounded-[18px] border border-stroke/70 bg-card/70 px-4 py-4 text-sm leading-6 text-muted">
        <p>
          Mode: {mode.replaceAll('_', ' ')} | Configured channels:{' '}
          {(report?.configured_channels ?? ['price']).join(', ')}
        </p>
        <p className="mt-2">
          Saved report: {formatTimestamp(report?.generated_at)}
        </p>
        <p className="mt-2">
          Read it this way: positive `delta MSE` means the model got worse after removing that channel,
          so that channel was helping. Negative `delta MSE` means the model improved without it.
        </p>
      </div>

      {error ? (
        <p className="rounded-[18px] border border-amber/30 bg-amber/10 px-4 py-3 text-sm leading-6 text-muted">
          {error}
          {hint ? ` ${hint}` : ''}
        </p>
      ) : null}

      {report ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-muted">
                <th className="px-3 py-2">Variant</th>
                <th className="px-3 py-2">Channels</th>
                <th className="px-3 py-2">MSE</th>
                <th className="px-3 py-2">Delta MSE</th>
                <th className="px-3 py-2">Dir Acc</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.map((entry) => (
                <tr
                  key={entry.label}
                  className="rounded-[16px] border border-stroke/60 bg-card/75"
                >
                  <td className="px-3 py-2 font-semibold text-ink">
                    {entry.removed_channel ? `Minus ${entry.removed_channel}` : 'Baseline'}
                  </td>
                  <td className="px-3 py-2 text-muted">{entry.channels.join(', ')}</td>
                  <td className="px-3 py-2 text-muted">{entry.mse.toFixed(4)}</td>
                  <td className="px-3 py-2 text-muted">
                    {entry.delta_mse === null
                      ? '--'
                      : `${entry.delta_mse > 0 ? '+' : ''}${entry.delta_mse.toFixed(4)}`}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {entry.directional_accuracy.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {isLoading
            ? 'Loading the saved feature ablation report...'
            : 'No saved feature ablation report is ready yet. Import a report bundle or run ablation to generate one.'}
        </p>
      )}
    </section>
  )
}
