'use client'

import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { TimeSeriesPoint } from '@/lib/types'
import { fmtMs } from '@/lib/utils'
import { format } from 'date-fns'

interface Props {
  timeSeries: TimeSeriesPoint[]
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4">
      <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-4">{title}</h3>
      {children}
    </div>
  )
}

const tickStyle = { fill: '#475569', fontSize: 10 }

function fmtTime(ts: number): string {
  try { return format(new Date(ts), 'HH:mm:ss') } catch { return '' }
}

const tooltipProps = {
  contentStyle: {
    background: '#0d1b2e',
    border: '1px solid #1a3352',
    borderRadius: '8px',
    fontSize: '11px',
    color: '#cbd5e1',
  },
  labelStyle: { color: '#64748b', marginBottom: '4px' },
}

export default function MetricCharts({ timeSeries }: Props) {
  if (timeSeries.length < 2) {
    return (
      <div className="text-xs text-slate-600 text-center py-8">
        Collecting data — charts appear after a few seconds…
      </div>
    )
  }

  const data = timeSeries.map(pt => ({
    ...pt,
    time: fmtTime(pt.timestamp),
    avgMs: Math.round(pt.avgResponseTime),
    p95Ms: Math.round(pt.p95),
    p99Ms: Math.round(pt.p99),
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Requests/sec */}
      <ChartCard title="Throughput (req/sec)">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="rpsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a3352" />
            <XAxis dataKey="time" tick={tickStyle} interval="preserveStartEnd" />
            <YAxis tick={tickStyle} width={45} />
            <Tooltip {...tooltipProps} formatter={(v: number) => [`${v.toFixed(1)} req/s`, 'RPS']} />
            <Area type="monotone" dataKey="requestsPerSecond" stroke="#3b82f6" fill="url(#rpsGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Response time */}
      <ChartCard title="Response Time (ms)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a3352" />
            <XAxis dataKey="time" tick={tickStyle} interval="preserveStartEnd" />
            <YAxis tick={tickStyle} width={55} tickFormatter={v => fmtMs(v)} />
            <Tooltip {...tooltipProps} formatter={(v: number, name: string) => [fmtMs(v), name]} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', color: '#64748b' }} />
            <Line type="monotone" dataKey="avgMs" name="Avg" stroke="#60a5fa" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="p95Ms" name="p95" stroke="#fbbf24" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="p99Ms" name="p99" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="2 2" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Error rate */}
      <ChartCard title="Error Rate (%)">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a3352" />
            <XAxis dataKey="time" tick={tickStyle} interval="preserveStartEnd" />
            <YAxis tick={tickStyle} width={40} unit="%" />
            <Tooltip {...tooltipProps} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Error Rate']} />
            <Area type="monotone" dataKey="errorRate" stroke="#ef4444" fill="url(#errGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Concurrency */}
      <ChartCard title="Concurrency / Status Codes">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a3352" />
            <XAxis dataKey="time" tick={tickStyle} interval="preserveStartEnd" />
            <YAxis tick={tickStyle} width={45} />
            <Tooltip {...tooltipProps} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', color: '#64748b' }} />
            <Line type="monotone" dataKey="concurrency" name="Concurrency" stroke="#a78bfa" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="status2xx" name="2xx" stroke="#34d399" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="status429" name="429" stroke="#fb923c" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
            <Line type="monotone" dataKey="status5xx" name="5xx" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
