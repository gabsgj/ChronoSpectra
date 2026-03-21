/*
Animation state machine for the How It Works page:
- `idle`: the explainer is parked on frame 0 and no timer is active.
- `playing`: a timer advances the shared `currentFrame` index across all panels.
- `paused`: the current frame is held in place with no automatic movement.
- `stepping`: a transient state that advances exactly one frame and then resolves
  to `paused`.

Transitions:
- `idle -> playing`: play
- `idle -> stepping`: step
- `playing -> paused`: pause or end-of-sequence
- `paused -> playing`: resume
- `paused -> stepping`: step
- `any -> idle`: rewind or stock change

Reduced motion:
- autoplay is disabled when `prefers-reduced-motion` is active
- all six panels render static snapshots for the active frame
- manual rewind, dot jumps, and stepping still work

All six panels are driven from one `currentFrame` index, and STFT frame data is
fetched once per selected stock via `/signal/stft-frames/{stock_id}`.
*/

import { useReducedMotion } from 'framer-motion'
import {
  startTransition,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useSearchParams } from 'react-router-dom'

import { CNNForwardPassAnim } from '../components/visualizations/CNNForwardPassAnim'
import { DataFlowAnim } from '../components/visualizations/DataFlowAnim'
import {
  buildPredictionSnapshot,
  buildProgressStops,
  buildSignalFromFrames,
} from '../components/visualizations/explainerData'
import { PredictionOutputAnim } from '../components/visualizations/PredictionOutputAnim'
import { SlidingWindowAnim } from '../components/visualizations/SlidingWindowAnim'
import { SpectrogramBuildAnim } from '../components/visualizations/SpectrogramBuildAnim'
import { STFTAnim } from '../components/visualizations/STFTAnim'
import { PageGuide } from '../components/ui/PageGuide'
import {
  activeStocks,
  defaultStockId,
  getStockById,
} from '../config/stocksConfig'
import { useStftFrames } from '../hooks/useStftFrames'

type PlaybackMode = 'idle' | 'paused' | 'playing' | 'stepping'

const PLAYBACK_INTERVAL_MS = 620

const resolveTheme = () => {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return 'Waiting for STFT frames'
  }
  return new Date(value).toLocaleString()
}

const buttonClassName =
  'rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition'

export default function HowItWorks() {
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
    <HowItWorksContent
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

interface HowItWorksContentProps {
  stock: NonNullable<ReturnType<typeof getStockById>>
  setStockId: (stockId: string) => void
}

const HowItWorksContent = ({
  stock,
  setStockId,
}: HowItWorksContentProps) => {
  const prefersReducedMotion = useReducedMotion()
  const theme = resolveTheme()
  const framesQuery = useStftFrames(stock.id)
  const signal = useMemo(() => buildSignalFromFrames(framesQuery.data), [framesQuery.data])
  const frameCount = framesQuery.data?.frames.length ?? 0
  const maxFrameIndex = Math.max(frameCount - 1, 0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('idle')
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const autoplayEnabled = !prefersReducedMotion

  useEffect(() => {
    if (frameCount === 0) {
      return
    }
    if (playbackMode === 'stepping') {
      const timerId = window.setTimeout(() => {
        startTransition(() => {
          setCurrentFrame((currentValue) => Math.min(currentValue + 1, maxFrameIndex))
          setPlaybackMode('paused')
        })
      }, 0)
      return () => window.clearTimeout(timerId)
    }
    if (playbackMode !== 'playing' || !autoplayEnabled) {
      return
    }

    const timerId = window.setTimeout(() => {
      startTransition(() => {
        if (currentFrame >= maxFrameIndex) {
          setPlaybackMode('paused')
          return
        }
        const nextFrame = Math.min(currentFrame + 1, maxFrameIndex)
        setCurrentFrame(nextFrame)
        if (nextFrame >= maxFrameIndex) {
          setPlaybackMode('paused')
        }
      })
    }, PLAYBACK_INTERVAL_MS / speedMultiplier)

    return () => window.clearTimeout(timerId)
  }, [
    autoplayEnabled,
    currentFrame,
    frameCount,
    maxFrameIndex,
    playbackMode,
    speedMultiplier,
  ])

  const activeFrame = framesQuery.data?.frames[currentFrame] ?? null
  const progress = frameCount <= 1 ? 0 : currentFrame / maxFrameIndex
  const progressStops = useMemo(() => buildProgressStops(frameCount), [frameCount])
  const prediction = useMemo(() => {
    return buildPredictionSnapshot(
      activeFrame,
      signal,
      framesQuery.data?.frequency_axis ?? [],
    )
  }, [activeFrame, framesQuery.data?.frequency_axis, signal])

  return (
    <div className="space-y-8">
      <section className="card-surface space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="eyebrow">How It Works</p>
            <h2 className="text-3xl text-ink">{stock.display_name}</h2>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Step through how a rolling price window becomes an FFT column, a
              spectrogram slice, and a model forecast.
            </p>
          </div>
          <div className="space-y-2 text-right text-sm text-muted">
            <p>Frames: {frameCount || 'Loading'}</p>
            <p>Current frame: {frameCount ? currentFrame + 1 : 0}</p>
            <p>Timestamp: {formatTimestamp(activeFrame?.frame_timestamp ?? null)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {activeStocks.map((activeStock) => {
            const isActive = activeStock.id === stock.id
            return (
              <button
                key={activeStock.id}
                type="button"
                onClick={() => setStockId(activeStock.id)}
                title={`Show the explainer using ${activeStock.id}.`}
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  isActive
                    ? 'border-teal/40 bg-teal/10 text-teal'
                    : 'border-stroke/70 text-muted hover:border-teal/25 hover:text-ink'
                }`}
              >
                {activeStock.id}
              </button>
            )
          })}
        </div>

        <PageGuide
          title="How to use the explainer"
          summary="This page is built to teach the pipeline visually. You do not need signal-processing background to follow it."
          steps={[
            'Start with Play or Step so every panel advances together from the same frame.',
            'Read left to right: raw window, FFT column, spectrogram build, CNN stage, then prediction output.',
            'If the animation feels too fast, slow the speed slider or use Step to move one frame at a time.',
          ]}
          nextHref={`/live?stock=${stock.id}`}
          nextLabel="Open live view"
        />
      </section>

      <section className="card-surface space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Playback Controls</p>
            <h3 className="mt-2 text-2xl text-ink">One timeline, six synchronized views</h3>
          </div>
          <div className="text-sm text-muted">
            {prefersReducedMotion
              ? 'Reduced motion is enabled, so autoplay is paused and the page stays in static snapshots.'
              : `Tempo ${speedMultiplier.toFixed(2)}x`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              startTransition(() => {
                setCurrentFrame(0)
                setPlaybackMode('idle')
              })
            }}
            title="Jump back to the first frame."
            className={`${buttonClassName} border-stroke/70 text-ink hover:border-teal/25 hover:text-teal`}
          >
            Rewind
          </button>
          <button
            type="button"
            disabled={prefersReducedMotion || frameCount === 0}
            onClick={() => {
              startTransition(() => {
                if (playbackMode === 'playing') {
                  setPlaybackMode('paused')
                  return
                }
                if (currentFrame >= maxFrameIndex) {
                  setCurrentFrame(0)
                }
                setPlaybackMode('playing')
              })
            }}
            title={playbackMode === 'playing' ? 'Pause the shared animation.' : 'Play the shared animation.'}
            className={`${buttonClassName} ${
              !autoplayEnabled || frameCount === 0
                ? 'cursor-not-allowed border-stroke/70 text-muted'
                : 'border-teal/35 text-teal hover:bg-teal/10'
            }`}
          >
            {playbackMode === 'playing' ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            disabled={frameCount === 0}
            onClick={() => {
              startTransition(() => {
                setPlaybackMode('stepping')
              })
            }}
            title="Advance exactly one frame."
            className={`${buttonClassName} ${
              frameCount === 0
                ? 'cursor-not-allowed border-stroke/70 text-muted'
                : 'border-amber/35 text-amber hover:bg-amber/10'
            }`}
          >
            Step
          </button>
          <label className="ml-auto flex min-w-[15rem] items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted">
            <span>Speed</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.25"
              value={speedMultiplier}
              disabled={Boolean(prefersReducedMotion)}
              onChange={(event) => {
                setSpeedMultiplier(Number(event.currentTarget.value))
              }}
              title="Adjust how quickly the shared explainer animation advances."
              className="h-2 flex-1 accent-teal"
            />
            <span>{speedMultiplier.toFixed(2)}x</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {progressStops.map((stop) => (
            <button
              key={stop}
              type="button"
              onClick={() => {
                startTransition(() => {
                  setCurrentFrame(stop)
                  setPlaybackMode('paused')
                })
              }}
              title={`Jump directly to frame ${stop + 1}.`}
              className={`h-3.5 w-3.5 rounded-full transition ${
                stop <= currentFrame ? 'bg-teal' : 'bg-stroke'
              }`}
              aria-label={`Jump to frame ${stop + 1}`}
            />
          ))}
        </div>
      </section>

      <DataFlowAnim
        playing={playbackMode === 'playing'}
        progress={progress}
        reducedMotion={Boolean(prefersReducedMotion)}
        theme={theme}
      />

      {framesQuery.error && !framesQuery.data ? (
        <section className="card-surface space-y-4 p-6">
          <p className="eyebrow">Frame Data Error</p>
          <h3 className="text-2xl text-ink">{framesQuery.error}</h3>
          {framesQuery.hint ? (
            <p className="text-sm leading-6 text-muted">{framesQuery.hint}</p>
          ) : null}
          <button
            type="button"
            onClick={framesQuery.retry}
            title="Retry loading the explainer frame data."
            className="rounded-full border border-teal/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal transition hover:bg-teal/10"
          >
            Retry
          </button>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ExplainerPanel
          eyebrow="Panel 1"
          title="Raw Signal"
          detail="The reconstructed price series stays fixed while the amber STFT window pulses over the active segment."
        >
          <SlidingWindowAnim
            signal={signal}
            frame={activeFrame}
            totalFrames={frameCount}
            reducedMotion={Boolean(prefersReducedMotion)}
            theme={theme}
            variant="overview"
          />
        </ExplainerPanel>

        <ExplainerPanel
          eyebrow="Panel 2"
          title="Sliding Window"
          detail="The same frame index isolates one local segment, ready for the next FFT column."
        >
          <SlidingWindowAnim
            signal={signal}
            frame={activeFrame}
            totalFrames={frameCount}
            reducedMotion={Boolean(prefersReducedMotion)}
            theme={theme}
            variant="focus"
          />
        </ExplainerPanel>

        <ExplainerPanel
          eyebrow="Panel 3"
          title="STFT Computation"
          detail="Every window becomes one spectral column, so the dominant cycles rise and fall frame by frame."
        >
          <STFTAnim
            frame={activeFrame}
            frequencyAxis={framesQuery.data?.frequency_axis ?? []}
            reducedMotion={Boolean(prefersReducedMotion)}
            theme={theme}
          />
        </ExplainerPanel>

        <ExplainerPanel
          eyebrow="Panel 4"
          title="Spectrogram Build"
          detail="The heatmap grows column by column, revealing when each frequency band becomes more energetic."
        >
          <SpectrogramBuildAnim
            currentFrame={currentFrame}
            frames={framesQuery.data?.frames ?? []}
            frequencyAxis={framesQuery.data?.frequency_axis ?? []}
            reducedMotion={Boolean(prefersReducedMotion)}
            theme={theme}
          />
        </ExplainerPanel>

        <ExplainerPanel
          eyebrow="Panel 5"
          title="CNN Forward Pass"
          detail="One glowing carrier moves from input to output, mirroring the shared progress through the pipeline."
        >
          <CNNForwardPassAnim
            progress={progress}
            reducedMotion={Boolean(prefersReducedMotion)}
            theme={theme}
          />
        </ExplainerPanel>

        <ExplainerPanel
          eyebrow="Panel 6"
          title="Prediction Output"
          detail="The explainer turns the active frame into a projected next-step price, confidence band, and future-actual comparison."
        >
          <PredictionOutputAnim
            prediction={prediction}
            reducedMotion={Boolean(prefersReducedMotion)}
            theme={theme}
          />
        </ExplainerPanel>
      </section>
    </div>
  )
}

interface ExplainerPanelProps {
  eyebrow: string
  title: string
  detail: string
  children: React.ReactNode
}

const ExplainerPanel = ({
  eyebrow,
  title,
  detail,
  children,
}: ExplainerPanelProps) => {
  return (
    <article className="card-surface flex h-full flex-col p-5">
      <div className="space-y-2">
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="text-xl text-ink">{title}</h3>
        <p className="text-sm leading-6 text-muted">{detail}</p>
      </div>
      <div className="mt-5 flex-1">{children}</div>
    </article>
  )
}
