import type { TransformName } from '../../types'

interface SignalTransformToggleProps {
  activeTransform: TransformName
  availableTransforms: TransformName[]
  onChange: (transform: TransformName) => void
}

const transformDetails: Record<
  TransformName,
  { label: string; summary: string }
> = {
  cwt: {
    label: 'CWT',
    summary: 'Continuous wavelets expose multi-scale bursts and trend transitions.',
  },
  hht: {
    label: 'HHT',
    summary: 'Hilbert-Huang emphasizes adaptive energy pockets in non-stationary data.',
  },
  stft: {
    label: 'STFT',
    summary: 'Short-time Fourier windows show where periodic behavior turns on or fades.',
  },
}

export const SignalTransformToggle = ({
  activeTransform,
  availableTransforms,
  onChange,
}: SignalTransformToggleProps) => {
  return (
    <section className="card-surface space-y-4 p-5">
      <div className="space-y-2">
        <p className="eyebrow">Transform Selector</p>
        <p className="text-sm leading-6 text-muted">
          Switch among the configured transforms to compare how each method
          emphasizes structure in the same close-price signal.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {availableTransforms.map((transform) => {
          const detail = transformDetails[transform]
          const isActive = transform === activeTransform

          return (
            <button
              key={transform}
              type="button"
              onClick={() => onChange(transform)}
              title={detail.summary}
              className={[
                'rounded-[22px] border p-4 text-left transition',
                isActive
                  ? 'border-teal bg-teal/12 shadow-[0_0_0_1px_rgba(0,212,170,0.28)]'
                  : 'border-stroke/70 bg-card/70 hover:border-teal/35',
              ].join(' ')}
              aria-pressed={isActive}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {detail.label}
              </p>
              <p className="mt-3 text-lg font-semibold text-ink">
                {detail.summary}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
