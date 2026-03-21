import { HoverHint } from '../ui/HoverHint'
import type {
  CWTParameters,
  HHTParameters,
  STFTParameters,
  TransformName,
} from '../../types'

interface SignalParameterExplorerProps {
  activeTransform: TransformName
  appliedSummary: string
  cwtParameters: CWTParameters
  hhtParameters: HHTParameters
  onCwtChange: (patch: Partial<CWTParameters>) => void
  onHhtChange: (patch: Partial<HHTParameters>) => void
  onStftChange: (patch: Partial<STFTParameters>) => void
  previewPending: boolean
  stftParameters: STFTParameters
}

interface SliderFieldProps {
  description: string
  highLabel?: string
  label: string
  max: number
  lowLabel?: string
  min: number
  onChange: (value: number) => void
  step?: number
  value: number
}

const waveletOptions = ['morl', 'mexh', 'gaus4']
const waveletDescriptions: Record<string, string> = {
  gaus4: 'Sharper burst detector with less smooth oscillation emphasis.',
  mexh: 'Highlights spike-like local changes and sudden structural breaks.',
  morl: 'Balanced default for smooth oscillations and repeating market cycles.',
}

const SliderField = ({
  description,
  highLabel,
  label,
  max,
  lowLabel,
  min,
  onChange,
  step = 1,
  value,
}: SliderFieldProps) => {
  return (
    <label className="space-y-3 rounded-[20px] border border-stroke/60 bg-card/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">{label}</p>
            <HoverHint label={`${label}. ${description}`} />
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
        <span className="rounded-full border border-stroke/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label}. ${description}`}
        className="slider-control"
      />
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>
          {lowLabel ? `${lowLabel} | ` : ''}
          {min}
        </span>
        <span className="text-right">
          {highLabel ? `${highLabel} | ` : ''}
          {max}
        </span>
      </div>
    </label>
  )
}

export const SignalParameterExplorer = ({
  activeTransform,
  appliedSummary,
  cwtParameters,
  hhtParameters,
  onCwtChange,
  onHhtChange,
  onStftChange,
  previewPending,
  stftParameters,
}: SignalParameterExplorerProps) => {
  return (
    <section className="card-surface space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Parameter Explorer</p>
          <p className="max-w-3xl text-sm leading-6 text-muted">
            Tune the active transform and let the preview refresh after a short
            debounce. STFT keeps the hop size below the window length so the
            overlap remains valid.
          </p>
        </div>
        <div className="rounded-[18px] border border-stroke/70 bg-card/70 px-4 py-3 text-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            {previewPending ? 'Preview queued' : 'Applied preview'}
          </p>
          <p className="mt-2 font-semibold text-ink">{appliedSummary}</p>
        </div>
      </div>

      {activeTransform === 'stft' ? (
        <div className="rounded-[20px] border border-teal/20 bg-teal/10 px-4 py-4 text-sm leading-6 text-muted">
          <p className="font-semibold text-ink">What does window length 64 mean?</p>
          <p className="mt-2">
            In the current daily-price setup, <span className="font-semibold text-ink">64</span>{' '}
            means each STFT slice looks at 64 trading-day samples at once. Larger windows improve
            frequency detail, while smaller windows react faster to short events.
          </p>
        </div>
      ) : null}

      {activeTransform === 'stft' ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <SliderField
            label="Window length"
            description="Larger windows improve frequency resolution but smooth out short events."
            lowLabel="Shorter"
            min={16}
            max={256}
            highLabel="Longer"
            step={8}
            value={stftParameters.window_length}
            onChange={(value) => onStftChange({ window_length: value })}
          />
          <SliderField
            label="Hop size"
            description="Smaller hops create more overlap and a denser time-axis preview."
            lowLabel="Dense overlap"
            min={1}
            max={Math.max(stftParameters.window_length - 1, 1)}
            highLabel="Less overlap"
            value={stftParameters.hop_size}
            onChange={(value) => onStftChange({ hop_size: value })}
          />
          <SliderField
            label="FFT length"
            description="Higher FFT sizes increase vertical detail in the frequency axis."
            lowLabel="Simpler"
            min={stftParameters.window_length}
            max={512}
            highLabel="More detail"
            step={8}
            value={stftParameters.n_fft}
            onChange={(value) => onStftChange({ n_fft: value })}
          />
        </div>
      ) : null}

      {activeTransform === 'cwt' ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-[20px] border border-stroke/60 bg-card/60 p-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-ink">Wavelet family</p>
              <HoverHint label="Wavelet family. This changes the shape of the analysis wave used to scan the signal, which changes whether the heatmap favors smooth cycles or sharper local bursts." />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              Different mother wavelets change how sharply local bursts and
              smooth trends appear in the heatmap.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {waveletOptions.map((wavelet) => {
                const isActive = wavelet === cwtParameters.wavelet
                return (
                  <button
                    key={wavelet}
                    type="button"
                    onClick={() => onCwtChange({ wavelet })}
                    aria-label={`Use the ${wavelet} wavelet family.`}
                    className={[
                      'rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition',
                      isActive
                        ? 'border-teal bg-teal/12 text-teal'
                        : 'border-stroke/70 text-muted hover:border-teal/35 hover:text-teal',
                    ].join(' ')}
                    aria-pressed={isActive}
                  >
                    {wavelet}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 rounded-[18px] border border-stroke/60 bg-shell/60 px-4 py-3 text-xs leading-6 text-muted">
              <p className="font-semibold text-ink">
                Current wavelet: {cwtParameters.wavelet}
              </p>
              <p>{waveletDescriptions[cwtParameters.wavelet] ?? 'Wavelet description unavailable.'}</p>
            </div>
          </div>
          <SliderField
            label="Scale count"
            description="More scales expose finer vertical detail at the cost of a denser matrix."
            lowLabel="Fewer scales"
            min={16}
            max={96}
            highLabel="More scales"
            step={4}
            value={cwtParameters.scales}
            onChange={(value) => onCwtChange({ scales: value })}
          />
        </div>
      ) : null}

      {activeTransform === 'hht' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SliderField
            label="Maximum IMFs"
            description="Controls how many intrinsic mode functions feed the Hilbert spectrum."
            lowLabel="Fewer modes"
            min={1}
            max={8}
            highLabel="More modes"
            value={hhtParameters.max_imfs}
            onChange={(value) => onHhtChange({ max_imfs: value })}
          />
          <SliderField
            label="Frequency bins"
            description="Sets how finely the Hilbert spectrum spreads energy across the y-axis."
            lowLabel="Coarser"
            min={16}
            max={128}
            highLabel="Finer"
            step={4}
            value={hhtParameters.frequency_bins}
            onChange={(value) => onHhtChange({ frequency_bins: value })}
          />
        </div>
      ) : null}
    </section>
  )
}
