'use client'

import { fmtMs, fmtNumber, fmtRps, cn } from '@/lib/utils'
import type { AggregatedMetrics } from '@/lib/types'
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Timer } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  color?: string
  large?: boolean
  compact?: boolean
}

function MetricCard({ label, value, sub, color = 'text-slate-100', large, compact }: MetricCardProps) {
  return (
    <div className="metric-card flex flex-col min-w-0">
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">{label}</span>
      <span className={cn(
        'font-mono font-bold mt-1 leading-none truncate',
        color,
        large ? 'text-2xl' : compact ? 'text-sm' : 'text-xl'
      )}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-slate-600 mt-0.5">{sub}</span>}
    </div>
  )
}

interface Props {
  metrics: AggregatedMetrics
  status: string
  elapsed: number
}

export default function LiveMetrics({ metrics, status, elapsed }: Props) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'

  const successRate = metrics.totalRequests > 0
    ? (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-4 fade-in">
      {/* Status bar */}
      <div className="flex items-center justify-between bg-[#0d1b2e] border border-[#1a3352] rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          {isRunning && (
            <>
              <span className="live-dot w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-sm text-emerald-400 font-medium">RUNNING</span>
            </>
          )}
          {isPaused && (
            <>
              <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
              <span className="text-sm text-yellow-400 font-medium">PAUSED</span>
            </>
          )}
          {!isRunning && !isPaused && (
            <>
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              <span className="text-sm text-blue-400 font-medium">{status.toUpperCase()}</span>
            </>
          )}
          {metrics.stressLevel !== undefined && (
            <span className="text-xs text-slate-500">Level: {metrics.stressLevel} users</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Timer size={12} />
          {fmtMs(elapsed)}
        </div>
      </div>

      {/* Primary metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        <MetricCard label="Total Requests" value={fmtNumber(metrics.totalRequests)} large />
        <MetricCard
          label="Successful"
          value={fmtNumber(metrics.successfulRequests)}
          color="text-emerald-400"
          sub={`${successRate}%`}
        />
        <MetricCard
          label="Failed"
          value={fmtNumber(metrics.failedRequests)}
          color={metrics.failedRequests > 0 ? 'text-red-400' : 'text-slate-400'}
          sub={`${metrics.errorRate.toFixed(1)}%`}
        />
        <MetricCard label="Req/sec" value={fmtRps(metrics.requestsPerSecond)} color="text-blue-400" />
        <MetricCard label="Concurrency" value={metrics.currentConcurrency} color="text-purple-400" />
      </div>

      {/* Latency grid */}
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-600 mb-2">Latency</p>
        <div className="grid grid-cols-4 gap-2">
          <MetricCard label="Min" value={fmtMs(metrics.minResponseTime)} compact />
          <MetricCard label="Avg" value={fmtMs(metrics.avgResponseTime)} color="text-blue-300" compact />
          <MetricCard label="p50" value={fmtMs(metrics.p50)} compact />
          <MetricCard label="p75" value={fmtMs(metrics.p75)} compact />
          <MetricCard label="p90" value={fmtMs(metrics.p90)} compact />
          <MetricCard label="p95" value={fmtMs(metrics.p95)} color="text-yellow-300" compact />
          <MetricCard label="p99" value={fmtMs(metrics.p99)} color="text-orange-300" compact />
          <MetricCard label="Max" value={fmtMs(metrics.maxResponseTime)} color={metrics.maxResponseTime > 5000 ? 'text-red-400' : 'text-slate-300'} compact />
        </div>
      </div>

      {/* Status codes */}
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-600 mb-2">HTTP Status</p>
        <div className="grid grid-cols-6 gap-2">
          <MetricCard label="2xx" value={fmtNumber(metrics.status2xx)} color="text-emerald-400" compact />
          <MetricCard label="3xx" value={fmtNumber(metrics.status3xx)} color="text-blue-400" compact />
          <MetricCard label="4xx" value={fmtNumber(metrics.status4xx)} color={metrics.status4xx > 0 ? 'text-yellow-400' : 'text-slate-500'} compact />
          <MetricCard label="429" value={fmtNumber(metrics.status429)} color={metrics.status429 > 0 ? 'text-orange-400' : 'text-slate-500'} compact />
          <MetricCard label="5xx" value={fmtNumber(metrics.status5xx)} color={metrics.status5xx > 0 ? 'text-red-400' : 'text-slate-500'} compact />
          <MetricCard label="Timeouts" value={fmtNumber(metrics.timeouts)} color={metrics.timeouts > 0 ? 'text-red-300' : 'text-slate-500'} compact />
        </div>
      </div>

      {/* Errors */}
      {metrics.errors.length > 0 && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
            <XCircle size={12} /> Error samples (recent)
          </p>
          <ul className="space-y-1">
            {metrics.errors.slice(0, 5).map((e, i) => (
              <li key={i} className="text-xs font-mono text-red-300">{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
