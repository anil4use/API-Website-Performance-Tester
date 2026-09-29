'use client'

import { useState } from 'react'
import { Download, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
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

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{report.testName}</h2>
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
