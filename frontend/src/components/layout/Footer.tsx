export function Footer() {
  return (
    <>
      <footer
        className="card-surface mt-2 border-t border-stroke/70 px-6 py-6"
        role="contentinfo"
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-4">
            <svg
              width="21"
              height="36"
              viewBox="0 0 28 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Human Icon"
              className="text-teal/70 transition-opacity duration-300 hover:opacity-100"
            >
              <rect x="11" y="2" width="6" height="6" fill="#4B6587" rx="1" />
              <rect x="10" y="10" width="8" height="14" fill="#4B6587" rx="1" />
              <rect
                x="4"
                y="12"
                width="4"
                height="10"
                transform="rotate(-30 6 12)"
                fill="#4B6587"
                rx="1"
              />
              <rect
                x="20"
                y="12"
                width="4"
                height="10"
                transform="rotate(30 22 12)"
                fill="#4B6587"
                rx="1"
              />
              <rect x="8" y="26" width="5" height="18" fill="#4B6587" rx="1" />
              <rect x="15" y="26" width="5" height="18" fill="#4B6587" rx="1" />
            </svg>
            <div className="text-xs font-medium text-ink">
              &copy; 2026 Gabriel James
            </div>
          </div>

          <nav className="flex gap-6 text-xs font-medium text-teal/80">
            <a
              href="https://gabrieljames.me"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-teal"
            >
              Website
            </a>
            <a
              href="https://github.com/gabsgj/Baum-Welch-Algorithm"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-teal"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>

      <div id="d3-tooltip" className="d3-tooltip hidden" />
    </>
  )
}
