import type {
  ApiErrorResponse,
  ColabArtifactImportResponse,
  CompleteArtifactImportResponse,
  FeatureAblationImportResponse,
  FFTResponse,
  MarketDataResponse,
  MarketStatusResponse,
  LiveMarketEvent,
  ModelBacktestResponse,
  ModelCompareResponse,
  ModelMode,
  PredictionResponse,
  RetrainingLogCollectionResponse,
  RetrainingProgressEvent,
  RetrainingProgressSnapshot,
  RetrainingStartResponse,
  RetrainingStatusResponse,
  SpectrogramRequestParams,
  SpectrogramResponse,
  STFTFramesResponse,
  TrainingReportCollectionResponse,
  TrainingReportDetailResponse,
  FeatureAblationReportResponse,
  TransformName,
  VariantModelMode,
} from '../types'

export class ApiClientError extends Error {
  status: number
  errorCode: string | null
  hint: string | null

  constructor(
    message: string,
    options: {
      status: number
      errorCode?: string | null
      hint?: string | null
    },
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = options.status
    this.errorCode = options.errorCode ?? null
    this.hint = options.hint ?? null
  }
}

const resolveApiBaseUrl = () => {
  const configuredUrl =
    import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE_URL
  if (configuredUrl) {
    const normalizedConfiguredUrl = configuredUrl.replace(/\/$/, '')
    return normalizedConfiguredUrl
  }
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '')
  }
  throw new Error('VITE_BACKEND_URL is not configured.')
}

export const API_BASE_URL = resolveApiBaseUrl()

const parseErrorResponse = async (response: Response) => {
  try {
    const payload = (await response.json()) as ApiErrorResponse
    return payload.detail
  } catch {
    return null
  }
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, init)
  if (!response.ok) {
    const detail = await parseErrorResponse(response)
    throw new ApiClientError(
      detail?.detail || `Request failed with status ${response.status}.`,
      {
        status: response.status,
        errorCode: detail?.error,
        hint: detail?.hint,
      },
    )
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiClientError(
      'Received a non-JSON response from the backend endpoint.',
      {
        status: response.status,
        errorCode: null,
        hint: `Verify VITE_BACKEND_URL points to your backend origin (current: ${API_BASE_URL}) and not to the frontend origin.`,
      },
    )
  }
}

const requestBlob = async (
  path: string,
  init?: RequestInit,
) => {
  const response = await fetch(`${API_BASE_URL}${path}`, init)
  if (!response.ok) {
    const detail = await parseErrorResponse(response)
    throw new ApiClientError(
      detail?.detail || `Request failed with status ${response.status}.`,
      {
        status: response.status,
        errorCode: detail?.error,
        hint: detail?.hint,
      },
    )
  }

  const contentDisposition = response.headers.get('content-disposition')
  const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/)
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] ?? null,
  }
}

const requestUploadJson = async <T>(
  path: string,
  body: BodyInit,
  headers?: HeadersInit,
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body,
    headers,
  })
  if (!response.ok) {
    const detail = await parseErrorResponse(response)
    throw new ApiClientError(
      detail?.detail || `Request failed with status ${response.status}.`,
      {
        status: response.status,
        errorCode: detail?.error,
        hint: detail?.hint,
      },
    )
  }
  return (await response.json()) as T
}

const buildSearchParams = (params: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return
    }
    searchParams.set(key, String(value))
  })
  return searchParams.toString()
}

export const apiClient = {
  getMarketData: (stockId: string, signal?: AbortSignal) =>
    requestJson<MarketDataResponse>(`/data/market-data/${stockId}`, { signal }),
  getMarketStatus: (exchange: string, signal?: AbortSignal) =>
    requestJson<MarketStatusResponse>(`/live/market-status/${exchange}`, { signal }),
  getModelComparison: (stockId: string, signal?: AbortSignal) =>
    requestJson<ModelCompareResponse>(`/model/compare/${stockId}`, { signal }),
  getPrediction: (
    stockId: string,
    options?: {
      mode?: VariantModelMode
      signal?: AbortSignal
    },
  ) => {
    const query = buildSearchParams({
      mode: options?.mode,
    })
    const suffix = query ? `?${query}` : ''
    return requestJson<PredictionResponse>(`/model/predict/${stockId}${suffix}`, {
      method: 'POST',
      signal: options?.signal,
    })
  },
  getModelBacktest: (
    stockId: string,
    options?: { limit?: number; mode?: VariantModelMode; signal?: AbortSignal },
  ) => {
    const query = buildSearchParams({
      limit: options?.limit,
      mode: options?.mode,
    })
    const suffix = query ? `?${query}` : ''
    return requestJson<ModelBacktestResponse>(
      `/model/backtest/${stockId}${suffix}`,
      { signal: options?.signal },
    )
  },
  getTrainingReports: (options?: { stockId?: string; signal?: AbortSignal }) => {
    const query = buildSearchParams({
      stock_id: options?.stockId,
    })
    const suffix = query ? `?${query}` : ''
    return requestJson<TrainingReportCollectionResponse>(
      `/training/report${suffix}`,
      { signal: options?.signal },
    )
  },
  getTrainingReportDetail: (stockId: string, signal?: AbortSignal) =>
    requestJson<TrainingReportDetailResponse>(
      `/training/report-detail/${stockId}`,
      { signal },
    ),
  importColabArtifactBundle: (file: File) =>
    requestUploadJson<ColabArtifactImportResponse>(
      '/training/import-colab-artifacts',
      file,
      {
        'Content-Type': file.type || 'application/zip',
        'X-Upload-Filename': file.name,
      },
    ),
  importFeatureAblationBundle: (file: File) =>
    requestUploadJson<FeatureAblationImportResponse>(
      '/training/import-feature-ablation-artifacts',
      file,
      {
        'Content-Type': file.type || 'application/zip',
        'X-Upload-Filename': file.name,
      },
    ),
  importCompleteArtifactBundle: (file: File) =>
    requestUploadJson<CompleteArtifactImportResponse>(
      '/training/import-complete-artifacts',
      file,
      {
        'Content-Type': file.type || 'application/zip',
        'X-Upload-Filename': file.name,
      },
    ),
  getFeatureAblationReport: (
    stockId: string,
    options?: {
      mode?: VariantModelMode
      signal?: AbortSignal
    },
  ) => {
    const query = buildSearchParams({
      mode: options?.mode,
    })
    const suffix = query ? `?${query}` : ''
    return requestJson<FeatureAblationReportResponse>(
      `/training/feature-ablation/${stockId}${suffix}`,
      { signal: options?.signal },
    )
  },
  runFeatureAblation: (
    stockId: string,
    options?: {
      mode?: VariantModelMode
      epochs?: number
      signal?: AbortSignal
    },
  ) => {
    const query = buildSearchParams({
      mode: options?.mode,
      epochs: options?.epochs,
    })
    const suffix = query ? `?${query}` : ''
    return requestJson<FeatureAblationReportResponse>(
      `/training/feature-ablation/${stockId}${suffix}`,
      {
        method: 'POST',
        signal: options?.signal,
      },
    )
  },
  getRetrainingStatus: (signal?: AbortSignal) =>
    requestJson<RetrainingStatusResponse>('/retraining/status', { signal }),
  getRetrainingLogs: (signal?: AbortSignal) =>
    requestJson<RetrainingLogCollectionResponse>('/retraining/logs', { signal }),
  startRetraining: (stockId: string) =>
    requestJson<RetrainingStartResponse>(`/retraining/start/${stockId}`, {
      method: 'POST',
    }),
  getRetrainingProgressUrl: (runId?: string) => {
    if (!runId) {
      return `${API_BASE_URL}/retraining/progress`
    }
    return `${API_BASE_URL}/retraining/progress?${buildSearchParams({ run_id: runId })}`
  },
  parseRetrainingProgressEvent: (
    rawEvent: MessageEvent<string>,
  ): RetrainingProgressEvent | RetrainingProgressSnapshot => {
    return JSON.parse(rawEvent.data) as
      | RetrainingProgressEvent
      | RetrainingProgressSnapshot
  },
  downloadNotebook: async (mode: ModelMode) => {
    const query = buildSearchParams({ mode })
    return requestBlob(`/notebook/generate?${query}`)
  },
  downloadFeatureAblationNotebook: async (mode: VariantModelMode) => {
    const query = buildSearchParams({ mode })
    return requestBlob(`/notebook/generate-feature-ablation?${query}`)
  },
  downloadCompleteNotebook: async (mode: ModelMode) => {
    const query = buildSearchParams({ mode })
    return requestBlob(`/notebook/generate-complete?${query}`)
  },
  getFrequencySpectrum: (stockId: string, signal?: AbortSignal) =>
    requestJson<FFTResponse>(`/signal/fft/${stockId}`, { signal }),
  getStftFrames: (stockId: string, signal?: AbortSignal) =>
    requestJson<STFTFramesResponse>(`/signal/stft-frames/${stockId}`, { signal }),
  getSpectrogram: (
    stockId: string,
    options: {
      transform: TransformName
      parameters?: SpectrogramRequestParams
      signal?: AbortSignal
    },
  ) => {
    const query = buildSearchParams({
      format: 'json',
      transform: options.transform,
      ...options.parameters,
    })
    return requestJson<SpectrogramResponse>(
      `/signal/spectrogram/${stockId}?${query}`,
      { signal: options.signal },
    )
  },
  getLiveStreamUrl: (stockId: string, mode?: VariantModelMode | null) => {
    const query = buildSearchParams({ mode: mode ?? undefined })
    const suffix = query ? `?${query}` : ''
    return `${API_BASE_URL}/live/stream/${stockId}${suffix}`
  },
  parseLiveEvent: (rawEvent: MessageEvent<string>): LiveMarketEvent => {
    return JSON.parse(rawEvent.data) as LiveMarketEvent
  },
}
