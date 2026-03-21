interface HoverHintProps {
  label: string
}

export function HoverHint({ label }: HoverHintProps) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        tabIndex={0}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-stroke/70 bg-card/90 text-[11px] font-semibold text-muted transition hover:border-teal/45 hover:text-teal focus:border-teal/45 focus:text-teal focus:outline-none"
        aria-label={label}
      >
        ?
      </button>
      <span
        className="pointer-events-none absolute right-0 top-full z-40 mt-2 hidden rounded-[16px] border border-stroke/70 bg-[#141824]/95 px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-white shadow-[0_18px_50px_-28px_rgba(15,17,23,0.8)] backdrop-blur group-hover:block group-focus-within:block"
        style={{ width: 'min(20rem, calc(100vw - 2rem))' }}
      >
        {label}
      </span>
    </span>
  )
}
