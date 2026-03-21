import sharedStocksJson from '@shared-config'
import type {
  AppConfig,
  ExchangeConfig,
  SignalProcessingConfig,
  StockConfig,
  TransformName,
} from '../types'

export const appConfig = sharedStocksJson as AppConfig

export const activeStocks = appConfig.stocks.filter(
  (stock): stock is StockConfig => stock.enabled,
)

export const activeStockIds = activeStocks.map((stock) => stock.id)
export const defaultStockId = activeStockIds[0] ?? ''
export const signalProcessingConfig =
  appConfig.signal_processing as SignalProcessingConfig
export const defaultTransform =
  signalProcessingConfig.default_transform as TransformName
export const availableTransforms =
  signalProcessingConfig.available_transforms as TransformName[]
export const exchangeEntries = Object.entries(appConfig.exchanges) as Array<
  [string, ExchangeConfig]
>

export const getStockById = (id: string): StockConfig | undefined => {
  return activeStocks.find((stock) => stock.id === id)
}

export const getStockColor = (id: string, fallback = '#00D4AA') => {
  return getStockById(id)?.color ?? fallback
}
