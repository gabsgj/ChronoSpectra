import { HoverHint } from './HoverHint'
import type { ThemeMode } from '../../types'

interface ThemeToggleProps {
  theme: ThemeMode
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-full border border-stroke/70 bg-card/85 px-4 py-2 text-sm font-medium text-ink transition hover:border-teal hover:text-teal"
        aria-label={`Switch to ${nextTheme} mode`}
        aria-pressed={theme === 'dark'}
      >
        <span className="text-xs uppercase tracking-[0.24em] text-muted">
          Theme
        </span>
        <span className="rounded-full bg-shell px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
          {theme}
        </span>
      </button>
      <HoverHint label={`Theme toggle. The app is currently in ${theme} mode. Activate this to switch to ${nextTheme} mode.`} />
    </div>
  )
}
