import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface HoverHintProps {
  label: string
}

interface TooltipPosition {
  left: number
  top: number
  width: number
}

const TOOLTIP_MARGIN = 16
const TOOLTIP_OFFSET = 10

export function HoverHint({ label }: HoverHintProps) {
  const hintId = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition>({
    left: TOOLTIP_MARGIN,
    top: TOOLTIP_MARGIN,
    width: 320,
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const updatePosition = () => {
      const button = buttonRef.current
      const tooltip = tooltipRef.current
      if (!button) {
        return
      }

      const bounds = button.getBoundingClientRect()
      const maxWidth = Math.min(320, window.innerWidth - TOOLTIP_MARGIN * 2)
      const tooltipHeight = tooltip?.getBoundingClientRect().height ?? 72
      const centeredLeft = bounds.left + bounds.width / 2 - maxWidth / 2
      const left = Math.min(
        Math.max(centeredLeft, TOOLTIP_MARGIN),
        window.innerWidth - maxWidth - TOOLTIP_MARGIN,
      )
      const openAbove =
        bounds.bottom + TOOLTIP_OFFSET + tooltipHeight >
        window.innerHeight - TOOLTIP_MARGIN
      const top = openAbove
        ? Math.max(TOOLTIP_MARGIN, bounds.top - tooltipHeight - TOOLTIP_OFFSET)
        : bounds.bottom + TOOLTIP_OFFSET

      setPosition({
        left,
        top,
        width: maxWidth,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  return (
    <>
      <span className="inline-flex shrink-0">
        <button
          ref={buttonRef}
          type="button"
          tabIndex={0}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-stroke/70 bg-card/90 text-[11px] font-semibold text-muted transition hover:border-teal/45 hover:text-teal focus:border-teal/45 focus:text-teal focus:outline-none"
          aria-label={label}
          aria-describedby={isOpen ? hintId : undefined}
        >
          ?
        </button>
      </span>
      {isOpen
        ? createPortal(
            <span
              id={hintId}
              ref={tooltipRef}
              className="pointer-events-none fixed z-[120] rounded-[16px] border border-stroke/70 bg-[#141824]/95 px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-white shadow-[0_18px_50px_-28px_rgba(15,17,23,0.8)] backdrop-blur"
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
                width: `${position.width}px`,
              }}
              role="tooltip"
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  )
}
