import { NextRequest, NextResponse } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'
import { getHistoryEntry } from '@/lib/db'
import type { TestReport, ExportFormat } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const format = (req.nextUrl.searchParams.get('format') ?? 'json') as ExportFormat

    const orch = getOrchestrator()
    let report: TestReport | null = orch.getReport(id)

    if (!report) {
      const entry = await getHistoryEntry(id)
      if (entry) report = JSON.parse(entry.reportSnapshot)
    }

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    switch (format) {
      case 'json':
        return new NextResponse(JSON.stringify(report, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="test-report-${id.slice(0, 8)}.json"`,
          },
        })

      case 'csv':
        return new NextResponse(generateCsv(report), {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="test-report-${id.slice(0, 8)}.csv"`,
          },
        })

      case 'html':
        return new NextResponse(generateHtml(report), {
          headers: {
            'Content-Type': 'text/html',
            'Content-Disposition': `attachment; filename="test-report-${id.slice(0, 8)}.html"`,
          },
        })

      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function generateCsv(report: TestReport): string {
  const { metrics } = report
  const lines: string[] = [
    'Metric,Value',
    `Test ID,${report.testId}`,
    `Target,${report.target}`,
    `Test Type,${report.testType}`,
    `Test Name,${report.testName}`,
    `Started At,${new Date(report.startedAt).toISOString()}`,
    `Completed At,${new Date(report.completedAt).toISOString()}`,
    `Duration (ms),${report.duration}`,
    '',
    'REQUEST STATISTICS',
    `Total Requests,${metrics.totalRequests}`,
    `Successful,${metrics.successfulRequests}`,
    `Failed,${metrics.failedRequests}`,
    `Requests/sec,${metrics.requestsPerSecond.toFixed(2)}`,
    `Error Rate (%),${metrics.errorRate.toFixed(2)}`,
    '',
    'LATENCY',
    `Min (ms),${metrics.minResponseTime.toFixed(2)}`,
    `Average (ms),${metrics.avgResponseTime.toFixed(2)}`,
    `p50 (ms),${metrics.p50.toFixed(2)}`,
    `p75 (ms),${metrics.p75.toFixed(2)}`,
    `p90 (ms),${metrics.p90.toFixed(2)}`,
    `p95 (ms),${metrics.p95.toFixed(2)}`,
    `p99 (ms),${metrics.p99.toFixed(2)}`,
    `p99.9 (ms),${metrics.p999.toFixed(2)}`,
    `Max (ms),${metrics.maxResponseTime.toFixed(2)}`,
    '',
    'HTTP STATUS',
    `2xx,${metrics.status2xx}`,
    `3xx,${metrics.status3xx}`,
    `4xx,${metrics.status4xx}`,
    `5xx,${metrics.status5xx}`,
    `429,${metrics.status429}`,
    '',
    'ERRORS',
    `Timeouts,${metrics.timeouts}`,
    `Connection Failures,${metrics.connectionFailures}`,
    `Rate Limited (429),${metrics.rateLimitedRequests}`,
  ]

  if (report.timeSeries.length > 0) {
    lines.push('', 'TIME SERIES', 'Timestamp,RPS,Avg RT (ms),Error Rate (%),Concurrency,p95,p99')
    for (const pt of report.timeSeries) {
      lines.push(`${new Date(pt.timestamp).toISOString()},${pt.requestsPerSecond.toFixed(1)},${pt.avgResponseTime.toFixed(1)},${pt.errorRate.toFixed(1)},${pt.concurrency},${pt.p95.toFixed(1)},${pt.p99.toFixed(1)}`)
    }
  }

  return lines.join('\n')
}

function generateHtml(report: TestReport): string {
  const { metrics } = report
  const fmt = (n: number, dec = 0) => n.toFixed(dec)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Test Report — ${report.testName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.5rem; color: #38bdf8; margin-bottom: 1rem; }
  h2 { font-size: 1.1rem; color: #94a3b8; margin: 1.5rem 0 0.75rem; border-bottom: 1px solid #1e3a5f; padding-bottom: 0.5rem; }
  .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
  .card { background: #1e293b; border: 1px solid #1e3a5f; border-radius: 8px; padding: 1rem; }
  .card-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: 1.4rem; font-weight: 700; color: #f1f5f9; margin-top: 0.25rem; font-family: monospace; }
  .card-unit { font-size: 0.75rem; color: #94a3b8; }
  .obs { background: #1e293b; border: 1px solid #1e3a5f; border-radius: 8px; padding: 1rem; }
  .obs li { margin: 0.5rem 0; padding-left: 1rem; border-left: 2px solid #3b82f6; font-size: 0.9rem; color: #cbd5e1; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; padding: 0.5rem; color: #64748b; border-bottom: 1px solid #1e3a5f; }
  td { padding: 0.5rem; border-bottom: 1px solid #0f172a; color: #e2e8f0; font-family: monospace; }
  .footer { margin-top: 2rem; color: #475569; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>Test Report — ${report.testName}</h1>
<div class="meta">
  Target: <strong>${report.target}</strong> &nbsp;|&nbsp;
  Type: <strong>${report.testType}</strong> &nbsp;|&nbsp;
  ${new Date(report.startedAt).toLocaleString()} &nbsp;|&nbsp;
  Duration: <strong>${(report.duration / 1000).toFixed(1)}s</strong>
</div>

<h2>Request Statistics</h2>
<div class="grid">
  <div class="card"><div class="card-label">Total</div><div class="card-value">${metrics.totalRequests.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">Successful</div><div class="card-value">${metrics.successfulRequests.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">Failed</div><div class="card-value">${metrics.failedRequests.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">Req/sec</div><div class="card-value">${fmt(metrics.requestsPerSecond, 1)}</div></div>
  <div class="card"><div class="card-label">Error Rate</div><div class="card-value">${fmt(metrics.errorRate, 2)}<span class="card-unit">%</span></div></div>
</div>

<h2>Latency</h2>
<div class="grid">
  <div class="card"><div class="card-label">Min</div><div class="card-value">${fmt(metrics.minResponseTime)}<span class="card-unit">ms</span></div></div>
  <div class="card"><div class="card-label">Avg</div><div class="card-value">${fmt(metrics.avgResponseTime)}<span class="card-unit">ms</span></div></div>
  <div class="card"><div class="card-label">p50</div><div class="card-value">${fmt(metrics.p50)}<span class="card-unit">ms</span></div></div>
  <div class="card"><div class="card-label">p90</div><div class="card-value">${fmt(metrics.p90)}<span class="card-unit">ms</span></div></div>
  <div class="card"><div class="card-label">p95</div><div class="card-value">${fmt(metrics.p95)}<span class="card-unit">ms</span></div></div>
  <div class="card"><div class="card-label">p99</div><div class="card-value">${fmt(metrics.p99)}<span class="card-unit">ms</span></div></div>
  <div class="card"><div class="card-label">p99.9</div><div class="card-value">${fmt(metrics.p999)}<span class="card-unit">ms</span></div></div>
  <div class="card"><div class="card-label">Max</div><div class="card-value">${fmt(metrics.maxResponseTime)}<span class="card-unit">ms</span></div></div>
</div>

<h2>HTTP Status</h2>
<div class="grid">
  <div class="card"><div class="card-label">2xx</div><div class="card-value">${metrics.status2xx.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">3xx</div><div class="card-value">${metrics.status3xx.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">4xx</div><div class="card-value">${metrics.status4xx.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">5xx</div><div class="card-value">${metrics.status5xx.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">429</div><div class="card-value">${metrics.status429.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">Timeouts</div><div class="card-value">${metrics.timeouts.toLocaleString()}</div></div>
</div>

<h2>Observations</h2>
<div class="obs"><ul>${report.observations.map(o => `<li>${o}</li>`).join('')}</ul></div>

<div class="footer">Generated by API Performance Tester &nbsp;|&nbsp; ${new Date().toLocaleString()}</div>
</body></html>`
}
