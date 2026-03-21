import type { LivePredictionPoint } from '../../types'

interface LivePredictionsTableProps {
  points: LivePredictionPoint[]
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

export const LivePredictionsTable = ({
  points,
}: LivePredictionsTableProps) => {
  const rows = [...points].reverse()

  return (
    <section className="card-surface overflow-hidden p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Last 10 Predictions</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Most recent streamed prediction records, newest first.
          </p>
        </div>
        <p className="text-sm text-muted">{rows.length} rows</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 flex min-h-[14rem] items-center justify-center rounded-[20px] border border-dashed border-stroke/70 text-sm text-muted">
          Waiting for live stream records...
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke/70 text-xs uppercase tracking-[0.18em] text-muted">
                <th className="pb-3 pr-4 font-medium">Timestamp</th>
                <th className="pb-3 pr-4 font-medium">Actual</th>
                <th className="pb-3 pr-4 font-medium">Predicted</th>
                <th className="pb-3 pr-4 font-medium">Spread</th>
                <th className="pb-3 font-medium">Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((point) => (
                <tr key={`${point.timestamp}-${point.predicted}`} className="border-b border-stroke/50">
                  <td className="py-3 pr-4 text-muted">
                    {new Date(point.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-ink">
                    {formatCurrency(point.actual)}
                  </td>
                  <td className="py-3 pr-4 text-ink">
                    {formatCurrency(point.predicted)}
                  </td>
                  <td
                    className={[
                      'py-3 pr-4 font-semibold',
                      point.spread >= 0 ? 'text-teal' : 'text-amber',
                    ].join(' ')}
                  >
                    {formatCurrency(point.spread)}
                  </td>
                  <td className="py-3 text-muted">
                    {point.prediction_mode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
