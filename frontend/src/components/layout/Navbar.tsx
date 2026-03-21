import { appConfig, activeStocks } from '../../config/stocksConfig'
import type { ThemeMode } from '../../types'
import { HoverHint } from '../ui/HoverHint'
import { ModelModeBadge } from '../ui/ModelModeBadge'
import { ThemeToggle } from '../ui/ThemeToggle'

interface NavbarProps {
  theme: ThemeMode
  onToggleTheme: () => void
}

export function Navbar({ theme, onToggleTheme }: NavbarProps) {
  return (
    <header className="panel-surface overflow-hidden px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="eyebrow">Financial Time-Frequency Forecasting</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl text-ink lg:text-4xl">
              {appConfig.app_name}
            </h1>
            <ModelModeBadge mode={appConfig.model_mode} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted">
            Config-driven signal processing, model comparison, live monitoring,
            and retraining views for every active stock in the workspace.
          </p>
        </div>
        <div className="flex max-w-full flex-col items-start gap-3 lg:items-end">
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-stroke/70 bg-card/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted">
            Need help?
            <HoverHint label="Hover over the small ? buttons across cards, badges, and controls to see plain-language guidance. The dashboard also includes a Start Here flow for beginners." />
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <p className="text-xs uppercase tracking-[0.24em] text-muted">
            {activeStocks.length} tracked stocks | v{appConfig.version}
          </p>
        </div>
      </div>
    </header>
  )
}
