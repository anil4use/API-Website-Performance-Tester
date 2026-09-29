'use client'

import { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'

interface LogEntry {
  ts: number
  s: number
  l: number
  e: string | null
  sz?: number
  bs?: string
}

interface Props {
  logs: LogEntry[]
  method: string
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found',
  304: 'Not Modified', 307: 'Temp Redirect', 308: 'Perm Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
  409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large',
  415: 'Unsupported Media', 422: 'Unprocessable', 429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Ver. Not Supported',
}

function statusColor(s: number): string {
  if (s === 0) return 'text-red-400'
  if (s >= 500) return 'text-red-400'
  if (s === 429) return 'text-orange-400'
  if (s >= 400) return 'text-yellow-400'
  if (s >= 300) return 'text-blue-400'
  return 'text-emerald-400'
}

function statusTextColor(s: number): string {
  if (s === 0) return 'text-red-500/70'
  if (s >= 500) return 'text-red-500/60'
  if (s === 429) return 'text-orange-500/60'
  if (s >= 400) return 'text-yellow-500/60'
  if (s >= 300) return 'text-blue-500/60'
  return 'text-emerald-600/50'
}

function latencyColor(l: number): string {
  if (l >= 5000) return 'text-red-400'
  if (l >= 2000) return 'text-orange-300'
  if (l >= 800) return 'text-yellow-300'
  return 'text-slate-300'
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function fmtLatency(l: number): string {
  if (l >= 1000) return `${(l / 1000).toFixed(2)}s`
  return `${l}ms`
}

function fmtSize(n?: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}

export default function LiveTerminal({ logs, method }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [logs])

  const rendered = logs.slice(-500)

  return (
    <div className="flex flex-col h-full bg-[#04090f] border border-[#152237] rounded-xl overflow-hidden font-mono text-xs">
      {/* Terminal chrome */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#070e1a] border-b border-[#152237] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <Terminal size={11} className="text-slate-500 ml-1" />
          <span className="text-slate-500 text-[11px]">live request stream</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-600">
          <span className="tabular-nums">{logs.length.toLocaleString()} req</span>
          <span className="text-slate-700">{method}</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-4 py-1 border-b border-[#0e1e30] text-[10px] text-slate-700 shrink-0 select-none">
        <span className="w-[86px] shrink-0">time</span>
        <span className="w-[42px] shrink-0">method</span>
        <span className="w-[38px] shrink-0">status</span>
        <span className="w-[150px] shrink-0">meaning</span>
        <span className="w-[64px] shrink-0">latency</span>
        <span className="w-[52px] shrink-0">size</span>
        <span>response / error</span>
      </div>

      {/* Scrollable log */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#1a3352 transparent' }}
      >
        {rendered.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 text-slate-700">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            waiting for first request…
          </div>
        )}

        {rendered.map((entry, i) => {
          const isErr = entry.s === 0 || entry.s >= 400 || !!entry.e
          const statusTxt = entry.s === 0 ? 'Connection Error' : (STATUS_TEXT[entry.s] ?? `HTTP ${entry.s}`)
          const showSnippet = isErr && (entry.bs || entry.e)
          const snippet = entry.bs || entry.e || ''

          return (
            <div
              key={i}
              className={`border-l-2 hover:bg-white/[0.025] transition-colors ${
                isErr ? 'border-red-500/40 bg-red-950/10' : 'border-transparent'
              }`}
            >
              {/* Main row */}
              <div className="flex items-center px-4 py-[2px]">
                <span className="w-[86px] shrink-0 text-slate-600 tabular-nums">{fmtTime(entry.ts)}</span>
                <span className="w-[42px] shrink-0 text-slate-500">{method}</span>
                <span className={`w-[38px] shrink-0 font-semibold tabular-nums ${statusColor(entry.s)}`}>
                  {entry.s === 0 ? 'ERR' : entry.s}
                </span>
                <span className={`w-[150px] shrink-0 truncate ${statusTextColor(entry.s)}`}>
                  {statusTxt}
                </span>
                <span className={`w-[64px] shrink-0 tabular-nums ${latencyColor(entry.l)}`}>
                  {fmtLatency(entry.l)}
                </span>
                <span className="w-[52px] shrink-0 text-slate-600 tabular-nums">
                  {fmtSize(entry.sz)}
                </span>
                {/* Response snippet inline when no error sub-row */}
                {!showSnippet && entry.bs && (
                  <span className="text-slate-700 truncate text-[10px]">{entry.bs.slice(0, 120)}</span>
                )}
              </div>

              {/* Body/error snippet row for errors */}
              {showSnippet && (
                <div className="flex items-start px-4 pb-[3px] pl-[272px] gap-1">
                  <span className="text-slate-700 shrink-0">↳</span>
                  <span className={`truncate ${entry.s >= 400 || entry.s === 0 ? 'text-red-400/60' : 'text-slate-600'}`}>
                    {snippet.slice(0, 200)}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-1 border-t border-[#0e1e30] shrink-0 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] text-slate-700 tabular-nums">
          showing last {Math.min(rendered.length, 500)} of {logs.length.toLocaleString()}
        </span>
      </div>
    </div>
  )
}
