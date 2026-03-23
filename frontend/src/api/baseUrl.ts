export interface BrowserLocationSnapshot {
  origin: string
  protocol: string
  hostname: string
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])
const DEFAULT_DEV_BACKEND_PORT = '8000'

const normalizeHostname = (hostname: string) => {
  return hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1')
}

const pushCandidate = (candidates: string[], value: string | null) => {
  if (!value || candidates.includes(value)) {
    return
  }
  candidates.push(value)
}

export const isLoopbackHostname = (hostname: string) => {
  return LOOPBACK_HOSTNAMES.has(normalizeHostname(hostname))
}

export const normalizeBaseUrl = (
  value: string | null | undefined,
  locationOrigin?: string,
) => {
  if (!value) {
    return null
  }

  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }

  try {
    const url = locationOrigin
      ? new URL(trimmedValue, locationOrigin)
      : new URL(trimmedValue)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export const rewriteLoopbackBaseUrl = (
  configuredUrl: string,
  locationSnapshot: BrowserLocationSnapshot,
) => {
  try {
    const parsedUrl = new URL(configuredUrl)
    if (!isLoopbackHostname(parsedUrl.hostname) || isLoopbackHostname(locationSnapshot.hostname)) {
      return null
    }
    parsedUrl.protocol = locationSnapshot.protocol
    parsedUrl.hostname = locationSnapshot.hostname
    return parsedUrl.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export const buildApiBaseUrlCandidates = (options: {
  configuredUrl?: string | null
  locationSnapshot?: BrowserLocationSnapshot
  defaultDevBackendPort?: string
}) => {
  const {
    configuredUrl = null,
    locationSnapshot,
    defaultDevBackendPort = DEFAULT_DEV_BACKEND_PORT,
  } = options

  const locationOrigin = locationSnapshot?.origin
  const normalizedConfiguredUrl = normalizeBaseUrl(configuredUrl, locationOrigin)
  const sameOriginBaseUrl = normalizeBaseUrl(locationOrigin)
  const sameOriginApiBaseUrl = sameOriginBaseUrl ? `${sameOriginBaseUrl}/api` : null
  const rewrittenLoopbackBaseUrl =
    normalizedConfiguredUrl && locationSnapshot
      ? rewriteLoopbackBaseUrl(normalizedConfiguredUrl, locationSnapshot)
      : null
  const devBackendBaseUrl = locationSnapshot
    ? normalizeBaseUrl(
        `${locationSnapshot.protocol}//${locationSnapshot.hostname}:${defaultDevBackendPort}`,
      )
    : null
  const devBackendApiBaseUrl = devBackendBaseUrl ? `${devBackendBaseUrl}/api` : null

  const candidates: string[] = []
  const configuredUrlTargetsLoopback =
    normalizedConfiguredUrl !== null &&
    locationSnapshot !== undefined &&
    isLoopbackHostname(new URL(normalizedConfiguredUrl).hostname) &&
    !isLoopbackHostname(locationSnapshot.hostname)

  if (configuredUrlTargetsLoopback) {
    pushCandidate(candidates, rewrittenLoopbackBaseUrl)
    pushCandidate(candidates, sameOriginApiBaseUrl)
    pushCandidate(candidates, sameOriginBaseUrl)
    pushCandidate(candidates, devBackendBaseUrl)
    pushCandidate(candidates, devBackendApiBaseUrl)
    pushCandidate(candidates, normalizedConfiguredUrl)
    return candidates
  }

  pushCandidate(candidates, normalizedConfiguredUrl)
  pushCandidate(candidates, sameOriginApiBaseUrl)
  pushCandidate(candidates, sameOriginBaseUrl)
  pushCandidate(candidates, rewrittenLoopbackBaseUrl)
  pushCandidate(candidates, devBackendBaseUrl)
  pushCandidate(candidates, devBackendApiBaseUrl)
  return candidates
}
