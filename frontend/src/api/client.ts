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
import { buildApiBaseUrlCandidates } from './baseUrl'

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

let resolvedApiBaseUrl: string | null = null
let apiBaseUrlResolution: Promise<string> | null = null

const resolveConfiguredApiBaseUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || null
}

const buildLocationSnapshot = () => {
  if (typeof window === 'undefined') {
    return undefined
  }
  return {
    origin: window.location.origin.replace(/\/$/, ''),
    protocol: window.location.protocol,
    hostname: window.location.hostname,
  }
}

const probeApiBaseUrl = async (candidateBaseUrl: string) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, 1500)

  try {
    const response = await fetch(`${candidateBaseUrl}/health`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      return false
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('application/json')) {
      return false
    }

    const payload = (await response.json()) as { status?: unknown }
    return payload.status === 'ok'
  } catch {
    return false
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export const resolveApiBaseUrl = async () => {
  if (resolvedApiBaseUrl) {
    return resolvedApiBaseUrl
  }
  if (apiBaseUrlResolution) {
    return apiBaseUrlResolution
  }

  apiBaseUrlResolution = (async () => {
    const candidates = buildApiBaseUrlCandidates({
      configuredUrl: resolveConfiguredApiBaseUrl(),
      locationSnapshot: buildLocationSnapshot(),
    })
    if (candidates.length === 0) {
      throw new Error('VITE_BACKEND_URL is not configured.')
    }

    for (const candidate of candidates) {
      if (await probeApiBaseUrl(candidate)) {
        return candidate
      }
    }

    return candidates[0]
  })()

  try {
    resolvedApiBaseUrl = await apiBaseUrlResolution
    return resolvedApiBaseUrl
  } finally {
    apiBaseUrlResolution = null
  }
}

const parseErrorResponse = async (response: Response) => {
  try {
    const payload = (await response.json()) as ApiErrorResponse
    return payload.detail
  } catch {
    return null
  }
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const apiBaseUrl = await resolveApiBaseUrl()
  const response = await fetch(`${apiBaseUrl}${path}`, init)
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
        hint: `Verify the runtime API base URL resolves to your backend origin (current: ${apiBaseUrl}) and not to the frontend document origin.`,
      },
    )
  }
}

const requestBlob = async (
  path: string,
  init?: RequestInit,
) => {
  const apiBaseUrl = await resolveApiBaseUrl()
  const response = await fetch(`${apiBaseUrl}${path}`, init)
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
  const apiBaseUrl = await resolveApiBaseUrl()
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
    return resolveApiBaseUrl().then((apiBaseUrl) => {
      if (!runId) {
        return `${apiBaseUrl}/retraining/progress`
      }
      return `${apiBaseUrl}/retraining/progress?${buildSearchParams({ run_id: runId })}`
    })
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
    return resolveApiBaseUrl().then((apiBaseUrl) => {
      const query = buildSearchParams({ mode: mode ?? undefined })
      const suffix = query ? `?${query}` : ''
      return `${apiBaseUrl}/live/stream/${stockId}${suffix}`
    })
  },
  parseLiveEvent: (rawEvent: MessageEvent<string>): LiveMarketEvent => {
    return JSON.parse(rawEvent.data) as LiveMarketEvent
  },
}
