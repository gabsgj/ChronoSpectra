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
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step?: number
  value: number
}

const waveletOptions = ['morl', 'mexh', 'gaus4']

const SliderField = ({
  description,
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: SliderFieldProps) => {
  return (
    <label className="space-y-3 rounded-[20px] border border-stroke/60 bg-card/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
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
        title={`${label}. ${description}`}
        className="w-full accent-teal"
      />
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{min}</span>
        <span>{max}</span>
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
        <div className="grid gap-4 xl:grid-cols-3">
          <SliderField
            label="Window length"
            description="Larger windows improve frequency resolution but smooth out short events."
            min={16}
            max={256}
            step={8}
            value={stftParameters.window_length}
            onChange={(value) => onStftChange({ window_length: value })}
          />
          <SliderField
            label="Hop size"
            description="Smaller hops create more overlap and a denser time-axis preview."
            min={1}
            max={Math.max(stftParameters.window_length - 1, 1)}
            value={stftParameters.hop_size}
            onChange={(value) => onStftChange({ hop_size: value })}
          />
          <SliderField
            label="FFT length"
            description="Higher FFT sizes increase vertical detail in the frequency axis."
            min={stftParameters.window_length}
            max={512}
            step={8}
            value={stftParameters.n_fft}
            onChange={(value) => onStftChange({ n_fft: value })}
          />
        </div>
      ) : null}

      {activeTransform === 'cwt' ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-[20px] border border-stroke/60 bg-card/60 p-4">
            <p className="text-sm font-semibold text-ink">Wavelet family</p>
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
                    title={`Use the ${wavelet} wavelet family.`}
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
          </div>
          <SliderField
            label="Scale count"
            description="More scales expose finer vertical detail at the cost of a denser matrix."
            min={16}
            max={96}
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
            min={1}
            max={8}
            value={hhtParameters.max_imfs}
            onChange={(value) => onHhtChange({ max_imfs: value })}
          />
          <SliderField
            label="Frequency bins"
            description="Sets how finely the Hilbert spectrum spreads energy across the y-axis."
            min={16}
            max={128}
            step={4}
            value={hhtParameters.frequency_bins}
            onChange={(value) => onHhtChange({ frequency_bins: value })}
          />
        </div>
      ) : null}
    </section>
  )
}
