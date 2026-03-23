import { ApiClientError } from '../api/client'

export interface FormattedApiError {
  error: string
  hint: string | null
}

export const formatApiError = (
  error: unknown,
  fallbackMessage: string,
): FormattedApiError => {
  if (error instanceof ApiClientError) {
    return {
      error: error.message,
      hint: error.hint,
    }
  }
  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase()
    const isNetworkLayerFailure =
      lowerMessage.includes('networkerror') ||
      lowerMessage.includes('failed to fetch') ||
      lowerMessage.includes('load failed')

    if (isNetworkLayerFailure) {
      return {
        error: error.message,
        hint: 'The browser could not reach the backend. Verify the runtime API base URL resolver points to the backend origin, backend CORS allows this site origin, and either the direct backend health endpoint or the same-origin `/api` proxy path is reachable.',
      }
    }

    return {
      error: error.message,
      hint: null,
    }
  }
  return {
    error: fallbackMessage,
    hint: null,
  }
}
