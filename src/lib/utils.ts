import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtMs(ms: number): string {
  if (ms === 0) return '0ms'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`
}

export function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function fmtRps(rps: number): string {
  if (rps >= 1000) return `${(rps / 1000).toFixed(1)}k/s`
  return `${rps.toFixed(1)}/s`
}

export function pct(a: number, b: number): string {
  if (b === 0) return '0%'
  return `${((a / b) * 100).toFixed(1)}%`
}

export function statusColor(code: number): string {
  if (code === 0) return 'text-gray-400'
  if (code < 300) return 'text-emerald-400'
  if (code < 400) return 'text-blue-400'
  if (code === 429) return 'text-orange-400'
  if (code < 500) return 'text-yellow-400'
  return 'text-red-400'
}

export function statusBg(code: number): string {
  if (code === 0) return 'bg-gray-800'
  if (code < 300) return 'bg-emerald-900/30'
  if (code < 400) return 'bg-blue-900/30'
  if (code === 429) return 'bg-orange-900/30'
  if (code < 500) return 'bg-yellow-900/30'
  return 'bg-red-900/30'
}

export function getStatusText(code: number): string {
  const map: Record<number, string> = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway',
    503: 'Service Unavailable', 504: 'Gateway Timeout',
  }
  return map[code] ?? ''
}
