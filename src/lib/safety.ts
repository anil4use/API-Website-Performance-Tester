import type { SafetyCheck } from './types'

// Private IP ranges per RFC 1918, RFC 4193, and cloud metadata
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // loopback
  /^10\./,                           // Class A private
  /^192\.168\./,                     // Class C private
  /^172\.(1[6-9]|2\d|3[01])\./,     // Class B private
  /^169\.254\./,                     // link-local (AWS metadata)
  /^::1$/,                           // IPv6 loopback
  /^fc00:/,                          // IPv6 private
  /^fe80:/,                          // IPv6 link-local
  /^0\./,                            // reserved
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT
]

const BLOCKED_HOSTS = [
  'localhost',
  '169.254.169.254',        // AWS/GCP metadata
  '169.254.170.2',          // ECS metadata
  'metadata.google.internal',
  'metadata.goog',
  '100.100.100.200',        // Alibaba metadata
]

const BLOCKED_SCHEMES = ['file', 'ftp', 'gopher', 'dict', 'ldap', 'ldaps']

export function checkUrlSafety(rawUrl: string, allowLocal: boolean = false): SafetyCheck {
  const reasons: string[] = []
  let isLocal = false
  let isPrivate = false

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return {
      safe: false,
      reasons: ['Invalid URL format.'],
      isLocal: false,
      isPrivate: false,
      requiresConfirmation: false,
    }
  }

  // Block dangerous schemes
  if (BLOCKED_SCHEMES.includes(parsed.protocol.replace(':', ''))) {
    return {
      safe: false,
      reasons: [`Protocol "${parsed.protocol}" is not allowed. Use http:// or https://.`],
      isLocal: false,
      isPrivate: false,
      requiresConfirmation: false,
    }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      safe: false,
      reasons: ['Only http:// and https:// protocols are supported.'],
      isLocal: false,
      isPrivate: false,
      requiresConfirmation: false,
    }
  }

  const hostname = parsed.hostname.toLowerCase()

  // Check blocked hostnames (cloud metadata endpoints)
  if (BLOCKED_HOSTS.includes(hostname)) {
    if (hostname === 'localhost') {
      isLocal = true
    } else {
      // Cloud metadata — always block unless explicitly flagged
      return {
        safe: false,
        reasons: [`Host "${hostname}" is a cloud metadata endpoint and cannot be tested.`],
        isLocal: false,
        isPrivate: true,
        requiresConfirmation: false,
      }
    }
  }

  // Check localhost variations
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') {
    isLocal = true
  }

  // Check private IPs
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      isPrivate = true
      if (hostname.startsWith('127.') || hostname === 'localhost') {
        isLocal = true
      }
      break
    }
  }

  if (isLocal || isPrivate) {
    if (!allowLocal) {
      reasons.push(
        `"${hostname}" is a ${isLocal ? 'localhost' : 'private network'} address.`,
        'Enable "Allow Local/Internal Testing" in Advanced Options to test local targets.'
      )
      return {
        safe: false,
        reasons,
        isLocal,
        isPrivate,
        requiresConfirmation: false,
      }
    }
    // Allowed but note it
    reasons.push(`Testing local/private target: ${hostname}`)
  }

  return {
    safe: true,
    reasons,
    isLocal,
    isPrivate,
    requiresConfirmation: !isLocal && !isPrivate,
  }
}

export function buildRequestHeaders(
  baseHeaders: Record<string, string>,
  auth: { type: string; token?: string; username?: string; password?: string; apiKey?: string; apiKeyHeader?: string },
  cookies: Record<string, string>,
  contentType: string,
  body?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'APIPerfTester/1.0 (local testing tool)',
    ...baseHeaders,
  }

  // Auth
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  } else if (auth.type === 'basic' && auth.username) {
    const creds = Buffer.from(`${auth.username}:${auth.password ?? ''}`).toString('base64')
    headers['Authorization'] = `Basic ${creds}`
  } else if (auth.type === 'api-key' && auth.apiKey) {
    const headerName = auth.apiKeyHeader || 'X-API-Key'
    headers[headerName] = auth.apiKey
  }

  // Content-Type
  if (body && contentType && contentType !== 'none') {
    headers['Content-Type'] = contentType
  }

  // Cookies
  const cookieEntries = Object.entries(cookies)
  if (cookieEntries.length > 0) {
    headers['Cookie'] = cookieEntries.map(([k, v]) => `${k}=${v}`).join('; ')
  }

  return headers
}

export function applyVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
}

export function buildQueryString(base: string, params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== '')
  if (entries.length === 0) return base

  const url = new URL(base)
  for (const [k, v] of entries) {
    url.searchParams.set(k, v)
  }
  return url.toString()
}
