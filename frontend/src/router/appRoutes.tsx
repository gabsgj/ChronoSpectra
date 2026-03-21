/* eslint-disable react-refresh/only-export-components */
import { lazy, type LazyExoticComponent, type ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'

import { defaultStockId } from '../config/stocksConfig'

const DashboardPage = lazy(() => import('../pages/Dashboard.tsx'))
const StockDetailPage = lazy(() => import('../pages/StockDetail.tsx'))
const SignalAnalysisPage = lazy(() => import('../pages/SignalAnalysis.tsx'))
const ModelComparisonPage = lazy(() => import('../pages/ModelComparison.tsx'))
const LiveTestingPage = lazy(() => import('../pages/LiveTesting.tsx'))
const HowItWorksPage = lazy(() => import('../pages/HowItWorks.tsx'))
const TrainingPage = lazy(() => import('../pages/Training.tsx'))

type RouteComponent = LazyExoticComponent<() => ReactNode>
type AppRouteId =
  | 'dashboard'
  | 'stock-detail'
  | 'signal-analysis'
  | 'model-comparison'
  | 'live-testing'
  | 'how-it-works'
  | 'training'

type ShellRouteDefinition =
  | {
      id: AppRouteId
      label: string
      description: string
      navPath: string
      end?: boolean
      page: RouteComponent
      index: true
      path?: undefined
    }
  | {
      id: AppRouteId
      label: string
      description: string
      navPath: string
      end?: boolean
      page: RouteComponent
      index?: false
      path: string
    }

export const shellRouteDefinitions: ShellRouteDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Market-wide overview across all active stocks.',
    navPath: '/',
    end: true,
    page: DashboardPage,
    index: true,
  },
  {
    id: 'stock-detail',
    label: 'Stock Detail',
    description: 'Aligned price, revenue, profit, index, and currency views.',
    navPath: `/stock/${defaultStockId}`,
    path: 'stock/:id',
    page: StockDetailPage,
  },
  {
    id: 'signal-analysis',
    label: 'Signal Analysis',
    description: 'Time-frequency transforms and analysis controls.',
    navPath: `/signal/${defaultStockId}`,
    path: 'signal/:id',
    page: SignalAnalysisPage,
  },
  {
    id: 'model-comparison',
    label: 'Model Comparison',
    description: 'Compare per-stock, unified, and embedding-backed models.',
    navPath: '/compare',
    path: 'compare',
    page: ModelComparisonPage,
  },
  {
    id: 'live-testing',
    label: 'Live Testing',
    description: 'Live prediction monitoring and market status.',
    navPath: '/live',
    path: 'live',
    page: LiveTestingPage,
  },
  {
    id: 'how-it-works',
    label: 'How It Works',
    description: 'Educational multi-panel explainer of the prediction pipeline.',
    navPath: '/explainer',
    path: 'explainer',
    page: HowItWorksPage,
  },
  {
    id: 'training',
    label: 'Training',
    description: 'Notebook downloads, training progress, and retraining controls.',
    navPath: '/training',
    path: 'training',
    page: TrainingPage,
  },
]

export const primaryNavRoutes = shellRouteDefinitions.map((route) => ({
  id: route.id,
  label: route.label,
  description: route.description,
  navPath: route.navPath,
  end: route.end ?? false,
}))

export const shellChildRoutes: RouteObject[] = shellRouteDefinitions.map((route) => {
  const element = <route.page />
  if (route.index) {
    return {
      index: true,
      element,
    }
  }
  return {
    path: route.path,
    element,
  }
})
