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
