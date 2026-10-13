'use client'

import { useState } from 'react'
import { Download, ChevronDown, ChevronRight, MessageSquare, Flame, AlertTriangle, ShieldAlert, Cpu, CheckCircle2, Server } from 'lucide-react'
import type { TestReport } from '@/lib/types'
import { fmtMs, fmtNumber, fmtDuration, fmtRps, cn } from '@/lib/utils'
import MetricCharts from './MetricCharts'
import { format } from 'date-fns'

interface Props {
  report: TestReport
  onExport?: (format: 'json' | 'csv' | 'html') => void
}

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[#1a3352]/40 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={cn('text-sm font-mono font-medium', highlight ?? 'text-slate-200')}>{value}</span>
    </div>
  )
}

export default function TestReportView({ report, onExport }: Props) {
  const [showCharts, setShowCharts] = useState(true)
  const { metrics } = report

  const successRate = metrics.totalRequests > 0
    ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)
    : '0.00'

  const started = format(new Date(report.startedAt), 'PPpp')
  const isBreakpoint = report.testType === 'breakpoint'

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-100">{report.testName}</h2>
            {isBreakpoint && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-900/40 border border-rose-800/40 text-rose-400 font-mono">
                BREAKPOINT TEST
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-mono text-blue-400">{report.target}</span>
            {' '}&middot; {report.testType} &middot; {started}
          </p>
        </div>
        {onExport && (
          <div className="flex gap-2">
            {(['json', 'csv', 'html'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => onExport(fmt)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[#1a3352] text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-all"
              >
                <Download size={11} />
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Breakpoint Specific Analysis Section ──────────────────────────── */}
      {isBreakpoint && (
        <div className="space-y-4">
          {/* Breaking Point Marker Banner */}
          {metrics.breakingPoint ? (
            <div className="bg-rose-950/30 border border-rose-800/50 rounded-2xl p-5 text-rose-200 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-rose-900/40 border border-rose-700/50 text-rose-400">
                    <Flame size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider font-bold text-rose-400">
                        Breaking Point Marker
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-900/60 font-mono text-rose-300">
                        COLLAPSED AT {new Date(metrics.breakingPoint.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-rose-100 mt-1">
                      {metrics.breakingPoint.reason}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xl font-bold font-mono text-rose-400">
                    {fmtNumber(metrics.breakingPoint.rps)} RPS
                  </div>
                  <div className="text-xs text-rose-300/80">at {fmtNumber(metrics.breakingPoint.concurrency)} VUs</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-rose-900/40 text-xs">
                <div>
                  <span className="text-rose-400/80 block">Error Rate at Break</span>
                  <span className="font-mono text-sm font-bold text-rose-200">{metrics.breakingPoint.errorRate.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-rose-400/80 block">p99 Latency at Break</span>
                  <span className="font-mono text-sm font-bold text-rose-200">{Math.round(metrics.breakingPoint.p99)}ms</span>
                </div>
                <div>
                  <span className="text-rose-400/80 block">Consecutive Timeouts</span>
                  <span className="font-mono text-sm font-bold text-rose-200">{metrics.breakingPoint.consecutiveTimeouts}</span>
                </div>
                {metrics.recoveryTimeMs !== undefined && metrics.recoveryTimeMs > 0 && (
                  <div>
                    <span className="text-rose-400/80 block">Estimated Recovery Time</span>
                    <span className="font-mono text-sm font-bold text-rose-200">{(metrics.recoveryTimeMs / 1000).toFixed(1)}s</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-5 text-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-900/40 border border-emerald-700/50 text-emerald-400">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">
                    System Survived Extreme Burst
                  </span>
                  <p className="text-sm text-emerald-100 mt-0.5">
                    Target successfully sustained the full burst window without breaching error or latency thresholds.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold font-mono text-emerald-300">
                  {fmtNumber(metrics.achievedRps ?? Math.round(metrics.requestsPerSecond))} RPS
                </span>
                <span className="text-xs text-emerald-400/80 block">Peak Delivered</span>
              </div>
            </div>
          )}

          {/* Configured vs Actually Achieved Cards & Honesty Check */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target vs Achieved */}
            <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-2">
                <Cpu size={14} className="text-blue-400" /> Target vs. Achieved Load
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#111f35] rounded-lg p-3">
                  <span className="text-[11px] text-slate-500 block">Virtual Users</span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Target: <strong className="text-slate-200">{fmtNumber(metrics.targetVirtualUsers || 0)}</strong>
                  </div>
                  <div className="text-sm font-bold font-mono text-blue-400 mt-1">
                    Achieved: {fmtNumber(metrics.achievedVirtualUsers || metrics.currentConcurrency)}
                  </div>
                </div>

                <div className="bg-[#111f35] rounded-lg p-3">
                  <span className="text-[11px] text-slate-500 block">Throughput</span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Target: <strong className="text-slate-200">{fmtNumber(metrics.targetRps || 0)} RPS</strong>
                  </div>
                  <div className="text-sm font-bold font-mono text-rose-400 mt-1">
                    Achieved: {fmtNumber(metrics.achievedRps ?? Math.round(metrics.requestsPerSecond))} RPS
                  </div>
                </div>
              </div>

              {metrics.targetRps && metrics.achievedRps && (
                <div className="text-xs text-slate-400 flex justify-between items-center pt-1">
                  <span>Achievement Ratio:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {((metrics.achievedRps / metrics.targetRps) * 100).toFixed(1)}% of requested load
                  </span>
                </div>
              )}
            </div>

            {/* Test-Rig Honesty Check */}
            <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-2">
                  <ShieldAlert size={14} className={metrics.honestyCheck?.severity === 'critical' ? 'text-rose-400' : metrics.honestyCheck?.severity === 'warning' ? 'text-amber-400' : 'text-emerald-400'} />
                  Test-Rig Honesty Check
                </h3>
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded font-mono uppercase font-semibold',
                  metrics.honestyCheck?.severity === 'critical'
                    ? 'bg-rose-950/50 text-rose-300 border border-rose-800/50'
                    : metrics.honestyCheck?.severity === 'warning'
                    ? 'bg-amber-950/50 text-amber-300 border border-amber-800/50'
                    : 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/50'
                )}>
                  {metrics.honestyCheck?.severity ?? 'VERIFIED'}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                {metrics.honestyCheck?.message || 'The test rig successfully generated the configured load without local socket or thread bottlenecks.'}
              </p>
            </div>
          </div>

          {/* Bottleneck Heuristic Diagnosis */}
          {metrics.bottleneckHint && (
            <div className="bg-[#0b1626] border border-[#1a3352] rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-300 block mb-0.5">
                  Automated Bottleneck Diagnosis
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {metrics.bottleneckHint}
                </p>
              </div>
            </div>
          )}

          {/* Per-Agent Fleet Breakdown (if distributed agents ran) */}
          {metrics.agentMetrics && Object.keys(metrics.agentMetrics).length > 0 && (
            <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-2">
                <Server size={14} className="text-emerald-400" /> Distributed Load Fleet Performance
              </h3>
              <div className="divide-y divide-[#1a3352] border border-[#1a3352] rounded-lg overflow-hidden bg-[#070e1a]">
                {Object.values(metrics.agentMetrics).map((ag) => (
                  <div key={ag.agentId} className="flex items-center justify-between px-4 py-2 text-xs">
                    <span className="font-medium text-slate-200">{ag.name}</span>
                    <div className="flex gap-4 font-mono text-slate-400">
                      <span>RPS: <strong className="text-blue-300">{fmtNumber(ag.rps)}</strong></span>
                      <span>Requests: <strong className="text-slate-200">{fmtNumber(ag.requests)}</strong></span>
                      <span>Errors: <strong className={ag.errors > 0 ? 'text-rose-400' : 'text-slate-200'}>{ag.errors}</strong></span>
                      <span>Latency: <strong className="text-slate-200">{ag.avgLatency}ms</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Requests', value: fmtNumber(metrics.totalRequests), color: '' },
          { label: 'Success Rate', value: `${successRate}%`, color: parseFloat(successRate) >= 99 ? 'text-emerald-400' : parseFloat(successRate) >= 95 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Req/sec', value: fmtRps(metrics.requestsPerSecond), color: 'text-blue-400' },
          { label: 'Duration', value: fmtDuration(report.duration), color: '' },
        ].map(c => (
          <div key={c.label} className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className={cn('text-2xl font-bold font-mono', c.color || 'text-slate-100')}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Latency + Status side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Latency Distribution</h3>
          <StatRow label="Minimum" value={fmtMs(metrics.minResponseTime)} />
          <StatRow label="Average" value={fmtMs(metrics.avgResponseTime)} highlight="text-blue-300" />
          <StatRow label="p50 (Median)" value={fmtMs(metrics.p50)} />
          <StatRow label="p75" value={fmtMs(metrics.p75)} />
          <StatRow label="p90" value={fmtMs(metrics.p90)} />
          <StatRow label="p95" value={fmtMs(metrics.p95)} highlight="text-yellow-300" />
          <StatRow label="p99" value={fmtMs(metrics.p99)} highlight="text-orange-300" />
          <StatRow label="p99.9" value={fmtMs(metrics.p999)} highlight="text-red-300" />
          <StatRow label="Maximum" value={fmtMs(metrics.maxResponseTime)} />
        </div>

        <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Request Breakdown</h3>
          <StatRow label="Total Requests" value={fmtNumber(metrics.totalRequests)} />
          <StatRow label="Successful" value={fmtNumber(metrics.successfulRequests)} highlight="text-emerald-400" />
          <StatRow label="Failed" value={fmtNumber(metrics.failedRequests)} highlight={metrics.failedRequests > 0 ? 'text-red-400' : undefined} />
          <StatRow label="Error Rate" value={`${metrics.errorRate.toFixed(2)}%`} highlight={metrics.errorRate > 5 ? 'text-red-400' : metrics.errorRate > 1 ? 'text-yellow-400' : undefined} />
          <StatRow label="2xx Responses" value={fmtNumber(metrics.status2xx)} highlight="text-emerald-400" />
          <StatRow label="3xx Responses" value={fmtNumber(metrics.status3xx)} />
          <StatRow label="4xx Responses" value={fmtNumber(metrics.status4xx)} highlight={metrics.status4xx > 0 ? 'text-yellow-400' : undefined} />
          <StatRow label="429 Rate Limited" value={fmtNumber(metrics.status429)} highlight={metrics.status429 > 0 ? 'text-orange-400' : undefined} />
          <StatRow label="5xx Server Errors" value={fmtNumber(metrics.status5xx)} highlight={metrics.status5xx > 0 ? 'text-red-400' : undefined} />
          <StatRow label="Timeouts" value={fmtNumber(metrics.timeouts)} highlight={metrics.timeouts > 0 ? 'text-red-300' : undefined} />
          <StatRow label="Connection Failures" value={fmtNumber(metrics.connectionFailures)} highlight={metrics.connectionFailures > 0 ? 'text-red-300' : undefined} />
        </div>
      </div>

      {/* Observations */}
      {report.observations.length > 0 && (
        <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
            <MessageSquare size={12} /> Performance Observations
          </h3>
          <ul className="space-y-2">
            {report.observations.map((obs, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-300">
                <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                {obs}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Charts */}
      <div>
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors mb-3"
        >
          {showCharts ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Time Series Charts
        </button>
        {showCharts && <MetricCharts timeSeries={report.timeSeries} />}
      </div>

      {/* Config summary */}
      <details className="group">
        <summary className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-600 hover:text-slate-400 cursor-pointer transition-colors">
          <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
          Test Configuration
        </summary>
        <pre className="mt-3 bg-[#0d1b2e] border border-[#1a3352] rounded-xl px-4 py-3 text-xs font-mono text-slate-500 overflow-auto max-h-[300px]">
          {JSON.stringify(report.config, null, 2)}
        </pre>
      </details>
    </div>
  )
}
