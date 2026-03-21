import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ChartOverlayModalProps {
  title: string
  detail: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export function ChartOverlayModal({
  title,
  detail,
  open,
  onClose,
  children,
}: ChartOverlayModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-[rgba(6,10,18,0.78)] p-2 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} fullscreen chart`}
    >
      <button
        type="button"
        aria-label="Close chart overlay"
        className="absolute inset-0"
        onClick={onClose}
      />
      <section className="relative z-[91] flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-stroke/70 bg-card/95 shadow-[0_32px_80px_-32px_rgba(0,0,0,0.58)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stroke/70 px-5 py-4 sm:px-7 sm:py-5">
          <div className="space-y-1">
            <p className="eyebrow">Fullscreen Graph</p>
            <h3 className="text-2xl text-ink">{title}</h3>
            <p className="max-w-4xl text-sm leading-6 text-muted">{detail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stroke/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-teal/40 hover:text-teal"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-6 sm:py-5">
          {children}
        </div>
      </section>
    </div>,
    document.body,
  )
}
