import { useRef, useState, type ReactNode } from 'react'

import { ChartOverlayModal } from './ChartOverlayModal'
import {
  downloadJson,
  downloadRowsAsCsv,
  downloadSvgAsPng,
  type ExportRow,
} from './chartDownloads'
import { HoverHint } from '../ui/HoverHint'

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
  const cardRef = useRef<HTMLElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  let content: ReactNode

  if (loading) {
    content = (
      <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted">
        Loading live market data...
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
          title="Retry loading this chart."
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

  const handleScreenshotDownload = async () => {
    const svg = cardRef.current?.querySelector('svg')
    if (!(svg instanceof SVGSVGElement) || !downloadFileBase) {
      return
    }
    await downloadSvgAsPng(svg, `${downloadFileBase}.png`)
  }

  const handleCsvDownload = () => {
    if (!downloadFileBase || !exportRows || exportRows.length === 0) {
      return
    }
    downloadRowsAsCsv(exportRows, `${downloadFileBase}.csv`)
  }

  const handleJsonDownload = () => {
    if (!downloadFileBase) {
      return
    }
    downloadJson(exportJson ?? exportRows ?? [], `${downloadFileBase}.json`)
  }

  return (
    <>
      <article
        ref={cardRef}
        className="card-surface flex h-full min-w-0 flex-col overflow-hidden p-5 lg:p-6"
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
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="rounded-full border border-stroke/70 px-3 py-2 transition hover:border-teal/45 hover:text-teal"
            >
              Enlarge
            </button>
            {downloadFileBase ? (
              <button
                type="button"
                onClick={() => void handleScreenshotDownload()}
                className="rounded-full border border-stroke/70 px-3 py-2 transition hover:border-teal/45 hover:text-teal"
              >
                PNG
              </button>
            ) : null}
            {downloadFileBase && exportRows && exportRows.length > 0 ? (
              <button
                type="button"
                onClick={handleCsvDownload}
                className="rounded-full border border-stroke/70 px-3 py-2 transition hover:border-teal/45 hover:text-teal"
              >
                CSV
              </button>
            ) : null}
            {downloadFileBase && (exportJson || exportRows) ? (
              <button
                type="button"
                onClick={handleJsonDownload}
                className="rounded-full border border-stroke/70 px-3 py-2 transition hover:border-teal/45 hover:text-teal"
              >
                JSON
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-5 min-w-0 flex-1">{content}</div>
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
