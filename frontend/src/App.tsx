import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { MobileNav } from './components/layout/MobileNav'
import { Footer } from './components/layout/Footer'
import { Navbar } from './components/layout/Navbar'
import { Sidebar } from './components/layout/Sidebar'
import {
  SharedTrainingReportsProvider,
  useSharedTrainingReports,
} from './contexts/SharedTrainingReportsContext'
import { useTheme } from './hooks/useTheme'

/**
 * Frontend decisions:
 * - Config loads from the shared root `stocks.json` through `config/stocksConfig.ts`, keeping route and UI state config-driven.
 * - Route metadata lives in one manifest so the router, sidebar, and mobile nav never drift apart.
 * - Theme state persists in `localStorage`, defaults to light mode when unset, and toggles the `dark` class on `<html>`.
 * - Active stock context lives in the URL for stock-specific pages, which keeps navigation and refresh behavior aligned.
 * - Live data stays page-local so SSE only runs when the Live Testing route is mounted.
 */
function App() {
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const isTrainingRoute = location.pathname === '/training'

  return (
    <SharedTrainingReportsProvider>
      <AppShell
        theme={theme}
        onToggleTheme={toggle}
        isTrainingRoute={isTrainingRoute}
      />
    </SharedTrainingReportsProvider>
  )
}

interface AppShellProps {
  isTrainingRoute: boolean
  onToggleTheme: () => void
  theme: ReturnType<typeof useTheme>['theme']
}

function AppShell({ isTrainingRoute, onToggleTheme, theme }: AppShellProps) {
  const trainingReports = useSharedTrainingReports()
  const trainingRuntime = trainingReports.data?.runtime ?? null
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      document.body.style.overflow = ''
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isMobileSidebarOpen])

  return (
    <div className="relative min-h-screen overflow-x-clip bg-shell text-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(11,143,156,0.18),transparent_40%),radial-gradient(circle_at_top_right,rgba(194,124,44,0.12),transparent_36%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(60,198,207,0.14),transparent_40%),radial-gradient(circle_at_top_right,rgba(226,162,79,0.14),transparent_36%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1840px] gap-4 px-3 py-3 sm:px-4 sm:py-4 lg:gap-6 lg:px-6 xl:gap-8 xl:px-8">
        <Sidebar
          trainingRuntime={trainingRuntime}
          trainingRuntimeLoading={trainingReports.isLoading}
          trainingRuntimeError={trainingReports.error}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Navbar
            theme={theme}
            onToggleTheme={onToggleTheme}
            onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
            trainingRuntime={trainingRuntime}
            trainingRuntimeLoading={trainingReports.isLoading}
            trainingRuntimeError={trainingReports.error}
            showTrainingRuntimeChip={!isTrainingRoute}
          />
          <MobileNav
            trainingRuntime={trainingRuntime}
            trainingRuntimeLoading={trainingReports.isLoading}
            trainingRuntimeError={trainingReports.error}
            showTrainingRuntimeChip={!isTrainingRoute}
          />
          <main className="panel-surface min-h-[calc(100svh-10rem)] min-w-0 p-4 sm:p-5 lg:p-8 xl:p-9">
            <Suspense
              fallback={
                <div className="card-surface flex min-h-[20rem] items-center justify-center p-6 text-sm text-muted">
                  Loading route shell...
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>
          <Footer />
        </div>
      </div>

      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Sidebar navigation">
          <button
            type="button"
            className="absolute inset-0 bg-[#0c1626]/40"
            aria-label="Close sidebar navigation"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative h-full w-[min(88vw,22rem)] p-3">
            <Sidebar
              trainingRuntime={trainingRuntime}
              trainingRuntimeLoading={trainingReports.isLoading}
              trainingRuntimeError={trainingReports.error}
              onNavigate={() => setIsMobileSidebarOpen(false)}
              className="panel-surface flex h-full min-h-0 w-full flex-col justify-between overflow-y-auto p-5"
            />
          </div>
        </div>
      ) : null}

      {!isMobileSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="fixed bottom-4 right-4 z-40 inline-flex h-12 items-center justify-center rounded-full border border-teal/30 bg-card/95 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-teal shadow-[0_20px_38px_-20px_rgba(8,15,28,0.42)] transition hover:bg-teal/10 lg:hidden"
          aria-label="Open sidebar navigation"
        >
          Menu
        </button>
      ) : null}
    </div>
  )
}

export default App
