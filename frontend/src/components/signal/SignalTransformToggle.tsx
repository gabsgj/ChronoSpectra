import type { TransformName } from '../../types'

interface SignalTransformToggleProps {
  activeTransform: TransformName
  availableTransforms: TransformName[]
  onChange: (transform: TransformName) => void
}

const transformDetails: Record<
  TransformName,
  {
    accentGlow: string
    accentPanel: string
    accentRing: string
    bestFor: string
    label: string
    pipelineNote: string
    role: string
    status: string
    summary: string
    tradeoff: string
  }
> = {
  cwt: {
    accentGlow:
      'from-[rgba(76,154,255,0.22)] via-[rgba(76,154,255,0.1)] to-transparent',
    accentPanel:
      'bg-[linear-gradient(180deg,rgba(76,154,255,0.12),rgba(76,154,255,0.03))]',
    accentRing: 'border-[rgba(76,154,255,0.36)]',
    bestFor:
      'Short bursts, long swings, and structures that stretch across multiple scales.',
    label: 'CWT',
    pipelineNote:
      'Best when the signal changes speed and one fixed observation window feels too rigid.',
    role: 'Multi-scale view',
    status: 'Scale-aware',
    summary: 'Catch bursts, transitions, and behavior that changes across scale.',
    tradeoff:
      'Scale is intuitive for comparison, but less direct than STFT when you want a simple time-frequency grid.',
  },
  hht: {
    accentGlow:
      'from-[rgba(160,109,255,0.22)] via-[rgba(160,109,255,0.1)] to-transparent',
    accentPanel:
      'bg-[linear-gradient(180deg,rgba(160,109,255,0.12),rgba(160,109,255,0.03))]',
    accentRing: 'border-[rgba(160,109,255,0.34)]',
    bestFor:
      'Non-stationary signals where the dominant behavior keeps shifting across time.',
    label: 'HHT',
    pipelineNote:
      'Use this to surface regime changes and adaptive oscillations that a fixed-grid transform can blur.',
    role: 'Adaptive view',
    status: 'Regime-sensitive',
    summary: 'Follow regime shifts and local energy pockets in non-stationary data.',
    tradeoff:
      'Most expressive for changing regimes, but also the least familiar if you are comparing stock signals quickly.',
  },
  stft: {
    accentGlow:
      'from-[rgba(0,191,165,0.24)] via-[rgba(0,191,165,0.1)] to-transparent',
    accentPanel:
      'bg-[linear-gradient(180deg,rgba(0,191,165,0.12),rgba(0,191,165,0.03))]',
    accentRing: 'border-teal/45',
    bestFor:
      'A first-pass read of repeating cycles, fade-ins, fade-outs, and stable periodic structure.',
    label: 'STFT',
    pipelineNote:
      'This is the main production pipeline, so it is the easiest choice when you want your charts to match the model view.',
    role: 'Balanced view',
    status: 'Recommended',
    summary: 'Track where repeating cycles appear, fade, or shift over time.',
    tradeoff:
      'You gain a clean grid and model alignment, but fixed windowing can miss some multi-scale nuance.',
  },
}

export const SignalTransformToggle = ({
  activeTransform,
  availableTransforms,
  onChange,
}: SignalTransformToggleProps) => {
  const activeDetail = transformDetails[activeTransform]

  return (
    <section className="card-surface min-w-0 space-y-5 p-6">
      <div className="space-y-3">
        <p className="eyebrow">Transform Selector</p>
        <p className="max-w-4xl text-sm leading-6 text-muted">
          Pick the lens first, then tune the parameters on the right. The active
          transform stays prominent below so beginners can understand why they
          are using it before they read the charts.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <div
          className="grid gap-3"
          role="list"
          aria-label="Available signal transforms"
        >
          {availableTransforms.map((transform) => {
            const detail = transformDetails[transform]
            const isActive = transform === activeTransform

            return (
              <button
                key={transform}
                type="button"
                onClick={() => onChange(transform)}
                className={[
                  'group relative overflow-hidden rounded-[24px] border p-4 text-left transition',
                  isActive
                    ? `${detail.accentRing} ${detail.accentPanel} shadow-[0_0_0_1px_rgba(255,255,255,0.04)]`
                    : 'border-stroke/70 bg-card/70 hover:border-teal/30 hover:bg-card/92',
                ].join(' ')}
                aria-pressed={isActive}
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r ${detail.accentGlow}`}
                />
                <div className="relative space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted">
                        {detail.label}
                      </p>
                      <p className="text-sm font-semibold text-ink">
                        {detail.role}
                      </p>
                    </div>
                    <span
                      className={[
                        'shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                        isActive
                          ? 'border-teal/35 bg-teal/12 text-teal'
                          : 'border-stroke/60 text-muted',
                      ].join(' ')}
                    >
                      {isActive ? 'Active' : detail.status}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-ink">{detail.summary}</p>
                  <p className="text-xs leading-5 text-muted">
                    {detail.tradeoff}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        <div
          className={[
            'relative overflow-hidden rounded-[28px] border p-6',
            activeDetail.accentRing,
            activeDetail.accentPanel,
          ].join(' ')}
        >
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br ${activeDetail.accentGlow}`}
          />
          <div className="relative min-w-0 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl space-y-3">
                <p className="eyebrow">Selected Transform</p>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-3xl text-ink">
                    {activeDetail.label} <span className="text-muted">/ {activeDetail.role}</span>
                  </h3>
                  <span className="rounded-full border border-teal/35 bg-teal/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal">
                    Active
                  </span>
                </div>
                <p className="text-lg leading-8 text-ink">
                  {activeDetail.summary}
                </p>
                <p className="max-w-3xl text-sm leading-6 text-muted">
                  {activeDetail.pipelineNote}
                </p>
              </div>
              <div className="rounded-[22px] border border-stroke/65 bg-card/78 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                  Readout
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {activeDetail.status}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-stroke/65 bg-card/82 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                  Best For
                </p>
                <p className="mt-3 text-sm leading-6 text-ink">
                  {activeDetail.bestFor}
                </p>
              </div>
              <div className="rounded-[22px] border border-stroke/65 bg-card/82 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                  Why You Would Pick It
                </p>
                <p className="mt-3 text-sm leading-6 text-ink">
                  {activeDetail.pipelineNote}
                </p>
              </div>
              <div className="rounded-[22px] border border-stroke/65 bg-card/82 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                  Watch For
                </p>
                <p className="mt-3 text-sm leading-6 text-ink">
                  {activeDetail.tradeoff}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
