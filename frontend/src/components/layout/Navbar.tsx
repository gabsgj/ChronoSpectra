import { appConfig, activeStocks } from '../../config/stocksConfig'
import type { ThemeMode, TrainingRuntimeResponse } from '../../types'
import { TrainingRuntimeChip } from '../training/TrainingRuntimeChip'
import { HoverHint } from '../ui/HoverHint'
import { ModelModeBadge } from '../ui/ModelModeBadge'
import { ThemeToggle } from '../ui/ThemeToggle'

interface NavbarProps {
  trainingRuntime: TrainingRuntimeResponse | null
  trainingRuntimeError: string | null
  trainingRuntimeLoading: boolean
  showTrainingRuntimeChip: boolean
  theme: ThemeMode
  onToggleTheme: () => void
  onOpenMobileSidebar: () => void
}

export function Navbar({
  trainingRuntime,
  trainingRuntimeError,
  trainingRuntimeLoading,
  showTrainingRuntimeChip,
  theme,
  onToggleTheme,
  onOpenMobileSidebar,
}: NavbarProps) {
  return (
    <header className="panel-surface overflow-visible px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="eyebrow">Financial Time-Frequency Forecasting</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal/25 bg-[radial-gradient(circle_at_30%_30%,rgba(0,191,165,0.28),rgba(79,124,255,0.08))]">
              <svg
                viewBox="0 0 44 44"
                className="h-7 w-7"
                aria-hidden="true"
                fill="none"
              >
                <path
                  d="M7 31.5L15.5 24.5L22 27.5L30 16L37 11.5"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-teal"
                />
                <path
                  d="M8 36H36"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  className="text-muted"
                />
                <path
                  d="M11 36V20M18 36V24M25 36V18M32 36V13"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  className="text-muted"
                />
              </svg>
            </div>
            <h1 className="min-w-0 text-3xl text-ink lg:text-4xl">
              {appConfig.app_name}
            </h1>
            <ModelModeBadge mode={appConfig.model_mode} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted">
            Config-driven signal processing, model comparison, live monitoring,
            and retraining views for every active stock in the workspace.
          </p>
        </div>
        <div className="min-w-0 flex max-w-full flex-col items-start gap-3 lg:items-end">
          {showTrainingRuntimeChip ? (
            <TrainingRuntimeChip
              runtime={trainingRuntime}
              loading={trainingRuntimeLoading}
              error={trainingRuntimeError}
              showWhenIdle
              className="w-full max-w-[31rem]"
            />
          ) : null}
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-stroke/70 bg-card/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted">
            Need help?
            <HoverHint label="Hover over the small ? buttons across cards, badges, and controls to see plain-language guidance. The dashboard also includes a Start Here flow for beginners." />
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="inline-flex items-center justify-center rounded-full border border-stroke/70 bg-card/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink transition hover:border-teal/40 hover:text-teal lg:hidden"
            aria-label="Open sidebar navigation"
          >
            Menu
          </button>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">
            {activeStocks.length} tracked stocks | v{appConfig.version}
          </p>
        </div>
      </div>
    </header>
  )
}
