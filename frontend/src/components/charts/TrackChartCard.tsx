import { useEffect, useRef, useState, type ReactNode } from 'react'

import { ChartOverlayModal } from './ChartOverlayModal'
import {
  downloadJson,
  downloadRowsAsCsv,
  downloadSvgAsPng,
  type ExportRow,
} from './chartDownloads'
import { HoverHint } from '../ui/HoverHint'

const FullscreenIcon = () => (
  <svg
    viewBox="0 0 20 20"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M7 3.5H3.5V7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 3.5h3.5V7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 16.5H3.5V13" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 16.5h3.5V13" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.75 7.75 3.5 3.5" strokeLinecap="round" />
    <path d="M12.25 7.75 16.5 3.5" strokeLinecap="round" />
    <path d="M7.75 12.25 3.5 16.5" strokeLinecap="round" />
    <path d="M12.25 12.25 16.5 16.5" strokeLinecap="round" />
  </svg>
)

interface TrackChartCardProps {
  title: string
  detail: string
  loading: boolean
  empty: boolean
  error: string | null
  hint?: string | null
  onRetry: () => void
  footer?: ReactNode
  children?: ReactNode
  expandedChildren?: ReactNode
  downloadFileBase?: string
  exportRows?: ExportRow[]
  exportJson?: unknown
}

type ExportFeedback =
  | {
      tone: 'success' | 'error'
      message: string
    }
  | null

const exportButtonClassName =
  'inline-flex h-10 items-center justify-center rounded-full border border-stroke/70 bg-card/82 px-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-teal/45 hover:bg-card hover:text-teal disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-stroke/70 disabled:hover:bg-card/82 disabled:hover:text-muted'

export const TrackChartCard = ({
  title,
  detail,
  loading,
  empty,
  error,
  hint,
  onRetry,
  footer,
  children,
  expandedChildren,
  downloadFileBase,
  exportRows,
  exportJson,
}: TrackChartCardProps) => {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback>(null)

  useEffect(() => {
    if (!exportFeedback) {
      return
    }

    const timer = window.setTimeout(() => {
      setExportFeedback(null)
    }, 2200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [exportFeedback])

  let content: ReactNode

  if (loading) {
    content = (
      <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted">
        Loading chart data...
      </div>
    )
  } else if (error) {
    content = (
      <div className="flex min-h-[16rem] flex-col items-start justify-center gap-3 rounded-[20px] border border-amber/30 bg-amber/10 p-5">
        <p className="text-sm font-semibold text-amber">Data request failed</p>
        <p className="text-sm leading-6 text-muted">{error}</p>
        {hint ? (
          <p className="text-xs leading-5 text-muted">{hint}</p>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry loading this chart."
          className="rounded-full border border-amber/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition hover:bg-amber/10"
        >
          Retry
        </button>
      </div>
    )
  } else if (empty) {
    content = (
      <div className="flex min-h-[16rem] items-center justify-center rounded-[20px] border border-dashed border-stroke/70 text-sm text-muted">
        No points are available for this track yet.
      </div>
    )
  } else {
    content = children
  }

  const canExportPng = Boolean(downloadFileBase) && !loading && !empty && !error
  const canExportCsv =
    canExportPng && Array.isArray(exportRows) && exportRows.length > 0
  const canExportJson =
    canExportPng &&
    (typeof exportJson !== 'undefined' ||
      (Array.isArray(exportRows) && exportRows.length > 0))

  const resolveChartSvg = () => {
    const svgCandidates = [
      ...(contentRef.current?.querySelectorAll('svg') ?? []),
    ].filter((candidate): candidate is SVGSVGElement => candidate instanceof SVGSVGElement)

    if (svgCandidates.length === 0) {
      return null
    }

    return svgCandidates.reduce<SVGSVGElement>((largest, current) => {
      const currentBounds = current.getBoundingClientRect()
      const largestBounds = largest.getBoundingClientRect()
      const currentArea = currentBounds.width * currentBounds.height
      const largestArea = largestBounds.width * largestBounds.height

      return currentArea >= largestArea ? current : largest
    }, svgCandidates[0])
  }

  const handleScreenshotDownload = async () => {
    if (!downloadFileBase || !canExportPng) {
      setExportFeedback({
        message: 'PNG export is unavailable until the chart finishes loading.',
        tone: 'error',
      })
      return
    }

    const svg = resolveChartSvg()
    if (!svg) {
      setExportFeedback({
        message: 'No chart graphic was found to export.',
        tone: 'error',
      })
      return
    }

    try {
      await downloadSvgAsPng(svg, `${downloadFileBase}.png`)
      setExportFeedback({
        message: 'PNG downloaded.',
        tone: 'success',
      })
    } catch {
      setExportFeedback({
        message: 'PNG export failed.',
        tone: 'error',
      })
    }
  }

  const handleCsvDownload = () => {
    if (!downloadFileBase || !exportRows || exportRows.length === 0) {
      setExportFeedback({
        message: 'CSV export needs visible chart rows first.',
        tone: 'error',
      })
      return
    }

    downloadRowsAsCsv(exportRows, `${downloadFileBase}.csv`)
    setExportFeedback({
      message: 'CSV downloaded.',
      tone: 'success',
    })
  }

  const handleJsonDownload = () => {
    if (!downloadFileBase || !canExportJson) {
      setExportFeedback({
        message: 'JSON export is unavailable for this chart right now.',
        tone: 'error',
      })
      return
    }

    downloadJson(exportJson ?? exportRows ?? [], `${downloadFileBase}.json`)
    setExportFeedback({
      message: 'JSON downloaded.',
      tone: 'success',
    })
  }

  return (
    <>
      <article
        className="card-surface relative isolate flex h-full min-w-0 flex-col overflow-visible p-5 lg:p-6"
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="eyebrow">{title}</p>
                <HoverHint label={hint ?? detail} />
              </div>
              <p className="text-sm leading-6 text-muted">{detail}</p>
            </div>
            <div className="flex min-w-0 flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                <button
                  type="button"
                  onClick={() => setIsExpanded(true)}
                  aria-label={`Open ${title} in fullscreen.`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke/70 bg-card/82 transition hover:border-teal/45 hover:bg-card hover:text-teal"
                >
                  <FullscreenIcon />
                  <span className="sr-only">Open fullscreen chart</span>
                </button>
                {downloadFileBase ? (
                  <button
                    type="button"
                    onClick={() => void handleScreenshotDownload()}
                    disabled={!canExportPng}
                    className={exportButtonClassName}
                  >
                    PNG
                  </button>
                ) : null}
                {downloadFileBase ? (
                  <button
                    type="button"
                    onClick={handleCsvDownload}
                    disabled={!canExportCsv}
                    className={exportButtonClassName}
                  >
                    CSV
                  </button>
                ) : null}
                {downloadFileBase ? (
                  <button
                    type="button"
                    onClick={handleJsonDownload}
                    disabled={!canExportJson}
                    className={exportButtonClassName}
                  >
                    JSON
                  </button>
                ) : null}
              </div>
              <p
                aria-live="polite"
                className={[
                  'min-h-[1.25rem] text-right text-[11px] font-medium',
                  exportFeedback?.tone === 'error' ? 'text-amber' : 'text-teal',
                ].join(' ')}
              >
                {exportFeedback?.message ?? ' '}
              </p>
            </div>
          </div>
        </div>
        <div ref={contentRef} className="relative z-0 mt-5 min-w-0 flex-1">
          {content}
        </div>
        {footer ? (
          <div className="mt-4 border-t border-stroke/60 pt-4">
            {footer}
          </div>
        ) : null}
      </article>

      <ChartOverlayModal
        title={title}
        detail={detail}
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
      >
        {expandedChildren ?? children}
      </ChartOverlayModal>
    </>
  )
}
