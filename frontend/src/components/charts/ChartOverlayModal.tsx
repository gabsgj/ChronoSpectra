import { useEffect } from 'react'

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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(6,10,18,0.72)] p-4 backdrop-blur-sm sm:p-6">
      <button
        type="button"
        aria-label="Close chart overlay"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section className="relative z-[71] flex max-h-[90svh] w-full max-w-[min(1420px,96vw)] flex-col overflow-hidden rounded-[28px] border border-stroke/70 bg-card/95 shadow-[0_32px_80px_-32px_rgba(0,0,0,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stroke/70 px-5 py-4 sm:px-6">
          <div className="space-y-1">
            <p className="eyebrow">Expanded Graph</p>
            <h3 className="text-2xl text-ink">{title}</h3>
            <p className="max-w-3xl text-sm leading-6 text-muted">{detail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stroke/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-teal/40 hover:text-teal"
          >
            Close
          </button>
        </div>
        <div className="overflow-auto p-4 sm:p-6">{children}</div>
      </section>
    </div>
  )
}
