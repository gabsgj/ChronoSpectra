import { startTransition, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { DominantFrequencyTimelineChart } from '../components/charts/DominantFrequencyTimelineChart'
import { FrequencySpectrumChart } from '../components/charts/FrequencySpectrumChart'
import { SignalSeriesChart } from '../components/charts/SignalSeriesChart'
import { SpectrogramHeatmap } from '../components/charts/SpectrogramHeatmap'
import { SpectrogramEnergyTimelineChart } from '../components/charts/SpectrogramEnergyTimelineChart'
import { SignalParameterExplorer } from '../components/signal/SignalParameterExplorer'
import { SignalTransformToggle } from '../components/signal/SignalTransformToggle'
import { MetricCard } from '../components/ui/MetricCard'
import { PageGuide } from '../components/ui/PageGuide'
import { StockSelector } from '../components/ui/StockSelector'
import {
  availableTransforms,
  defaultTransform,
  getStockById,
  signalProcessingConfig,
} from '../config/stocksConfig'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useFrequencySpectrum } from '../hooks/useFrequencySpectrum'
import { useSpectrogram } from '../hooks/useSpectrogram'
import type {
  CWTParameters,
  HHTParameters,
  SpectrogramRequestParams,
  STFTParameters,
  StockConfig,
  ThemeMode,
  TransformName,
} from '../types'

const PREVIEW_DEBOUNCE_MS = 420

const resolveTheme = (): ThemeMode => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const buildDefaultStftParameters = (): STFTParameters => ({
  hop_size: signalProcessingConfig.stft.hop_size,
  n_fft: signalProcessingConfig.stft.n_fft,
  window_length: signalProcessingConfig.stft.window_length,
})

const buildDefaultCwtParameters = (): CWTParameters => ({
  scales: signalProcessingConfig.cwt.scales,
  wavelet: signalProcessingConfig.cwt.wavelet,
})

const buildDefaultHhtParameters = (): HHTParameters => ({
  frequency_bins: signalProcessingConfig.hht?.frequency_bins ?? 64,
  max_imfs: signalProcessingConfig.hht?.max_imfs ?? 6,
})

const clampStftParameters = (
  currentParameters: STFTParameters,
  patch: Partial<STFTParameters>,
): STFTParameters => {
  const window_length = patch.window_length ?? currentParameters.window_length
  const hop_size = Math.min(
    Math.max(patch.hop_size ?? currentParameters.hop_size, 1),
    Math.max(window_length - 1, 1),
  )
  const n_fft = Math.max(patch.n_fft ?? currentParameters.n_fft, window_length)

  return {
    hop_size,
    n_fft,
    window_length,
  }
}

const clampCwtParameters = (
  currentParameters: CWTParameters,
  patch: Partial<CWTParameters>,
): CWTParameters => ({
  scales: Math.max(patch.scales ?? currentParameters.scales, 1),
  wavelet: patch.wavelet ?? currentParameters.wavelet,
})

const clampHhtParameters = (
  currentParameters: HHTParameters,
  patch: Partial<HHTParameters>,
): HHTParameters => ({
  frequency_bins: Math.max(patch.frequency_bins ?? currentParameters.frequency_bins, 2),
  max_imfs: Math.max(patch.max_imfs ?? currentParameters.max_imfs, 1),
})

const serializeParameters = (parameters: SpectrogramRequestParams) => {
  return JSON.stringify(
    Object.entries(parameters).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    ),
  )
}

const buildParameterSummary = (
  transform: TransformName,
  parameters: SpectrogramRequestParams,
) => {
  if (transform === 'stft') {
    return `STFT | L ${parameters.window_length} | H ${parameters.hop_size} | FFT ${parameters.n_fft}`
  }
  if (transform === 'cwt') {
    return `CWT | ${parameters.wavelet} wavelet | ${parameters.scales} scales`
  }
  return `HHT | ${parameters.max_imfs} IMFs | ${parameters.frequency_bins} bins`
}

const formatCycleLength = (frequencyValue: number | null) => {
  if (typeof frequencyValue !== 'number' || frequencyValue <= 0) {
    return 'Awaiting spectrum'
  }

  const days = 1 / frequencyValue
  if (!Number.isFinite(days) || days > 365) {
    return 'Long regime cycle'
  }
  if (days >= 30) {
    return `${days.toFixed(0)} trading days`
  }
  return `${days.toFixed(1)} trading days`
}

const formatRawSignal = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value)
}

const formatNormalizedSignal = (value: number) => value.toFixed(3)

export default function SignalAnalysis() {
  const { id = '' } = useParams()
  const stock = getStockById(id)

  if (!stock) {
    return (
      <section className="card-surface p-8">
        <p className="eyebrow">Unknown Stock</p>
        <h2 className="mt-3 text-2xl text-ink">No config entry matches {id}.</h2>
      </section>
    )
  }

  return <SignalAnalysisContent key={stock.id} stock={stock} />
}

interface SignalAnalysisContentProps {
  stock: StockConfig
}

const SignalAnalysisContent = ({ stock }: SignalAnalysisContentProps) => {
  const [activeTransform, setActiveTransform] =
    useState<TransformName>(defaultTransform)
  const [stftParameters, setStftParameters] = useState(buildDefaultStftParameters)
  const [cwtParameters, setCwtParameters] = useState(buildDefaultCwtParameters)
  const [hhtParameters, setHhtParameters] = useState(buildDefaultHhtParameters)
  const appliedStftParameters = useDebouncedValue(
    stftParameters,
    PREVIEW_DEBOUNCE_MS,
  )
  const appliedCwtParameters = useDebouncedValue(
    cwtParameters,
    PREVIEW_DEBOUNCE_MS,
  )
  const appliedHhtParameters = useDebouncedValue(
    hhtParameters,
    PREVIEW_DEBOUNCE_MS,
  )
  const theme = resolveTheme()

  const draftParameters = useMemo<SpectrogramRequestParams>(() => {
    if (activeTransform === 'stft') {
      return stftParameters
    }
    if (activeTransform === 'cwt') {
      return cwtParameters
    }
    return hhtParameters
  }, [activeTransform, cwtParameters, hhtParameters, stftParameters])

  const appliedParameters = useMemo<SpectrogramRequestParams>(() => {
    if (activeTransform === 'stft') {
      return appliedStftParameters
    }
    if (activeTransform === 'cwt') {
      return appliedCwtParameters
    }
    return appliedHhtParameters
  }, [activeTransform, appliedCwtParameters, appliedHhtParameters, appliedStftParameters])

  const previewPending = serializeParameters(draftParameters) !== serializeParameters(appliedParameters)
  const parameterSummary = buildParameterSummary(activeTransform, appliedParameters)

  const spectrum = useFrequencySpectrum(stock.id)
  const spectrogram = useSpectrogram({
    stockId: stock.id,
    transform: activeTransform,
    parameters: appliedParameters,
  })
  const dominantSpectrumFrequency = useMemo(() => {
    const frequency = spectrum.data?.frequency ?? []
    const amplitude = spectrum.data?.amplitude ?? []

    if (frequency.length === 0 || amplitude.length === 0) {
      return null
    }

    let bestIndex = 0
    let bestAmplitude = amplitude[0] ?? Number.NEGATIVE_INFINITY

    for (let index = 1; index < amplitude.length; index += 1) {
      const currentAmplitude = amplitude[index] ?? Number.NEGATIVE_INFINITY
      if (currentAmplitude > bestAmplitude) {
        bestAmplitude = currentAmplitude
        bestIndex = index
      }
    }

    return frequency[bestIndex] ?? null
  }, [spectrum.data?.amplitude, spectrum.data?.frequency])
  const rawSignalPoints = useMemo(() => {
    if (!spectrogram.data) {
      return []
    }

    return spectrogram.data.signal_timestamps.map((timestamp, index) => ({
      timestamp,
      value: spectrogram.data?.raw_signal[index] ?? 0,
    }))
  }, [spectrogram.data])
  const normalizedSignalPoints = useMemo(() => {
    if (!spectrogram.data) {
      return []
    }

    return spectrogram.data.signal_timestamps.map((timestamp, index) => ({
      timestamp,
      value: spectrogram.data?.normalized_signal[index] ?? 0,
    }))
  }, [spectrogram.data])

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <p className="eyebrow">Signal Analysis</p>
        <h2 className="text-3xl text-ink">{stock.display_name}</h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          Inspect the stock from time domain into frequency domain. The
          frequency-amplitude spectrum leads the workflow because it is the
          clearest first pass at dominant cycles before you drill into the
          heatmap and regime summaries.
        </p>
        <StockSelector activeStockId={stock.id} basePath="/signal" />
        <PageGuide
          title="How to use the signal tools"
          summary="This page helps you move from 'what happened' to 'what frequency behavior might explain it' without needing signal-processing background."
          steps={[
            'Choose a transform first. STFT is the easiest starting point because it balances time and frequency clearly.',
            'Read the frequency-amplitude chart first. It shows which repeating cycles matter most in the selected signal.',
            'Use the raw and normalized time-domain charts next, then the heatmap, then the derived energy and dominant-frequency summaries underneath.',
          ]}
          nextHref="/explainer"
          nextLabel="Open explainer"
        />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[0.88fr_1.12fr]">
        <SignalTransformToggle
          activeTransform={activeTransform}
          availableTransforms={availableTransforms}
          onChange={(transform) => {
            startTransition(() => {
              setActiveTransform(transform)
            })
          }}
        />

        <SignalParameterExplorer
          activeTransform={activeTransform}
          appliedSummary={parameterSummary}
          cwtParameters={cwtParameters}
          hhtParameters={hhtParameters}
          onCwtChange={(patch) => {
            startTransition(() => {
              setCwtParameters((currentParameters) =>
                clampCwtParameters(currentParameters, patch),
              )
            })
          }}
          onHhtChange={(patch) => {
            startTransition(() => {
              setHhtParameters((currentParameters) =>
                clampHhtParameters(currentParameters, patch),
              )
            })
          }}
          onStftChange={(patch) => {
            startTransition(() => {
              setStftParameters((currentParameters) =>
                clampStftParameters(currentParameters, patch),
              )
            })
          }}
          previewPending={previewPending}
          stftParameters={stftParameters}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Active Transform"
          value={activeTransform.toUpperCase()}
          detail="The transform currently driving the spectrogram and derived charts."
          hint="This is the analysis method currently used to build the heatmap and the supporting charts."
        />
        <MetricCard
          label="Time Slices"
          value={String(spectrogram.data?.time_axis.length ?? 0)}
          detail="Columns currently visible in the sampled spectrogram grid."
          hint="How many time columns are visible in the current spectrogram preview."
        />
        <MetricCard
          label="Frequency Bins"
          value={String(spectrogram.data?.frequency_axis.length ?? 0)}
          detail="Bands rendered in the current spectrogram preview."
          hint="How many frequency layers the current spectrogram preview is showing."
        />
        <MetricCard
          label="Dominant Cycle"
          value={formatCycleLength(dominantSpectrumFrequency)}
          detail="Approximate period implied by the strongest FFT band."
          hint="A simple estimate of the strongest repeating cycle seen in the frequency spectrum."
        />
        <MetricCard
          label="Normalization"
          value="Min-max"
          detail="The backend currently scales the close-price signal into a 0 to 1 range before transforms and prediction."
          hint="Min-max normalization is active in this signal pipeline. A z-score utility exists in the backend, but it is not the active transform input here."
        />
        <MetricCard
          label="STFT Window"
          value={`${stftParameters.window_length} samples`}
          detail="Each STFT column uses this many daily samples from the normalized signal."
          hint="A window length of 64 means one STFT slice looks at 64 trading-day samples at a time."
        />
      </section>

      <section className="min-w-0">
        <FrequencySpectrumChart
          frequency={spectrum.data?.frequency ?? []}
          amplitude={spectrum.data?.amplitude ?? []}
          loading={spectrum.isLoading}
          error={spectrum.error}
          hint={spectrum.hint}
          onRetry={spectrum.retry}
          theme={theme}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <SignalSeriesChart
            title="Time-Domain Price Signal"
            detail="The raw close-price series in the time domain. Use this before the transform views so you stay anchored in the original price movement."
            points={rawSignalPoints}
            loading={spectrogram.isLoading}
            error={spectrogram.error}
            hint={spectrogram.hint}
            onRetry={spectrogram.retry}
            theme={theme}
            tone="teal"
            formatValue={formatRawSignal}
            valueKey="raw_close"
          />
        </div>
        <div className="min-w-0">
          <SignalSeriesChart
            title="Normalized Signal"
            detail="The min-max normalized series fed into the transform pipeline. This is what the FFT, STFT, CWT, HHT, and prediction models actually consume."
            points={normalizedSignalPoints}
            loading={spectrogram.isLoading}
            error={spectrogram.error}
            hint={spectrogram.hint}
            onRetry={spectrogram.retry}
            theme={theme}
            tone="amber"
            formatValue={formatNormalizedSignal}
            valueKey="normalized_value"
            footer={
              <p className="text-xs leading-5 text-muted">
                Backend status: min-max normalization is active here; z-score is available but not currently selected in the pipeline.
              </p>
            }
          />
        </div>
      </section>

      <section className="min-w-0">
        <SpectrogramHeatmap
          data={spectrogram.data}
          loading={spectrogram.isLoading}
          error={spectrogram.error}
          hint={spectrogram.hint}
          onRetry={spectrogram.retry}
          theme={theme}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <SpectrogramEnergyTimelineChart
            data={spectrogram.data}
            loading={spectrogram.isLoading}
            error={spectrogram.error}
            hint={spectrogram.hint}
            onRetry={spectrogram.retry}
            theme={theme}
          />
        </div>
        <div className="min-w-0">
          <DominantFrequencyTimelineChart
            data={spectrogram.data}
            loading={spectrogram.isLoading}
            error={spectrogram.error}
            hint={spectrogram.hint}
            onRetry={spectrogram.retry}
            theme={theme}
          />
        </div>
      </section>
    </div>
  )
}
