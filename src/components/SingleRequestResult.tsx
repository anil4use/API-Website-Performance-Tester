'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import type { SingleRequestResult } from '@/lib/types'
import { fmtMs, fmtBytes, statusColor, cn } from '@/lib/utils'

interface Props {
  result: SingleRequestResult
}

function MetricRow({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#1a3352]/50">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-mono text-slate-200">{value}{unit}</span>
    </div>
  )
}

export default function SingleRequestResultView({ result }: Props) {
  const [showBody, setShowBody] = useState(true)
  const [showHeaders, setShowHeaders] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyBody() {
    navigator.clipboard.writeText(result.responseBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatBody(body: string): string {
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }

  const isSuccess = result.success && result.statusCode >= 200 && result.statusCode < 400

  return (
    <div className="space-y-4 fade-in">
      {/* Status header */}
      <div className={cn(
        'flex items-center gap-3 p-4 rounded-xl border',
        isSuccess
          ? 'bg-emerald-950/30 border-emerald-900/40'
          : 'bg-red-950/30 border-red-900/40'
      )}>
        {isSuccess
          ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
          : <XCircle size={20} className="text-red-400 shrink-0" />
        }
        <div>
          <div className="flex items-center gap-3">
            <span className={cn('text-2xl font-bold font-mono', statusColor(result.statusCode))}>
              {result.statusCode || 'Error'}
            </span>
            <span className="text-slate-400 text-sm">{result.statusText}</span>
            <span className="text-xs text-slate-600 font-mono">{result.method} {result.url}</span>
          </div>
          {result.error && (
            <p className="text-sm text-red-400 mt-1">{result.error}</p>
          )}
        </div>
        <div className="ml-auto text-right">
          <div className="text-2xl font-bold font-mono text-blue-300">{fmtMs(result.totalTime)}</div>
          <div className="text-xs text-slate-500">total time</div>
        </div>
      </div>

      {/* Timing breakdown */}
      <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Timing Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8">
          <MetricRow label="DNS Lookup" value={fmtMs(result.dnsTime)} />
          <MetricRow label="TCP Connection" value={fmtMs(result.tcpTime)} />
          <MetricRow label="TLS Handshake" value={result.url.startsWith('https') ? fmtMs(result.tlsTime) : 'N/A'} />
          <MetricRow label="Time to First Byte" value={fmtMs(result.ttfb)} />
          <MetricRow label="Total Response Time" value={fmtMs(result.totalTime)} />
          <MetricRow label="Response Size" value={fmtBytes(result.responseSize)} />
        </div>

        {result.redirectCount > 0 && (
          <div className="mt-3 pt-3 border-t border-[#1a3352]/50">
            <p className="text-xs text-slate-500 mb-1">Redirects: {result.redirectCount}</p>
            {result.redirectUrls.map((url, i) => (
              <p key={i} className="text-xs font-mono text-blue-400">→ {url}</p>
            ))}
          </div>
        )}
      </div>

      {/* Response headers */}
      <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl overflow-hidden">
        <button
          onClick={() => setShowHeaders(!showHeaders)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#111f35] transition-colors"
        >
          <span className="text-xs uppercase tracking-widest text-slate-500">
            Response Headers ({Object.keys(result.responseHeaders).length})
          </span>
          {showHeaders ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </button>
        {showHeaders && (
          <div className="px-4 pb-4 space-y-1">
            {Object.entries(result.responseHeaders).map(([k, v]) => (
              <div key={k} className="flex gap-3 text-xs">
                <span className="text-blue-400 font-mono min-w-[180px] shrink-0">{k}</span>
                <span className="text-slate-300 font-mono break-all">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Response body */}
      <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setShowBody(!showBody)}
            className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
          >
            Response Body
            {showBody ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={copyBody}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {showBody && (
          <pre className="px-4 pb-4 text-xs font-mono text-slate-300 overflow-auto max-h-[400px] whitespace-pre-wrap break-all leading-relaxed">
            {result.responseBody ? formatBody(result.responseBody) : <span className="text-slate-600">(empty body)</span>}
          </pre>
        )}
      </div>
    </div>
  )
}
