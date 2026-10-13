import type { RequestResult, AggregatedMetrics, TimeSeriesPoint } from './types'

export function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export function aggregateResults(
  testId: string,
  results: RequestResult[],
  elapsed: number,
  currentConcurrency: number,
  previousTimeSeries: TimeSeriesPoint[],
  stressLevel?: number
): AggregatedMetrics {
  if (results.length === 0) {
    return {
      testId,
      timestamp: Date.now(),
      elapsed,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsPerSecond: 0,
      currentConcurrency,
      avgResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, p999: 0,
      status2xx: 0, status3xx: 0, status4xx: 0, status5xx: 0, status429: 0,
      timeouts: 0, connectionFailures: 0, rateLimitedRequests: 0,
      errorRate: 0,
      errors: [],
      timeSeries: previousTimeSeries,
      stressLevel,
    }
  }

  const times = results.map(r => r.responseTime).sort((a, b) => a - b)
  const successful = results.filter(r => r.statusCode >= 200 && r.statusCode < 400 && !r.error)
  const failed = results.filter(r => r.statusCode === 0 || r.statusCode >= 400 || !!r.error)

  let s2xx = 0, s3xx = 0, s4xx = 0, s5xx = 0, s429 = 0
  let timeouts = 0, connFails = 0
  const errors: string[] = []

  for (const r of results) {
    if (r.statusCode >= 200 && r.statusCode < 300) s2xx++
    else if (r.statusCode >= 300 && r.statusCode < 400) s3xx++
    else if (r.statusCode === 429) { s429++; s4xx++ }
    else if (r.statusCode >= 400 && r.statusCode < 500) s4xx++
    else if (r.statusCode >= 500) s5xx++

    if (r.isTimeout) timeouts++
    if (r.isConnectionFailure) connFails++
    if (r.error && errors.length < 10) {
      if (!errors.includes(r.error)) errors.push(r.error)
    }
  }

  const elapsedSec = elapsed / 1000
  const rps = elapsedSec > 0 ? results.length / elapsedSec : 0
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length

  // Build time series point (last 60s window)
  const now = Date.now()
  const windowStart = now - 5000
  const windowResults = results.filter(r => r.timestamp >= windowStart)
  const windowTimes = windowResults.map(r => r.responseTime).sort((a, b) => a - b)
  const windowFailed = windowResults.filter(r => r.error || r.statusCode === 0 || r.statusCode >= 500).length

  const newPoint: TimeSeriesPoint = {
    timestamp: now,
    requestsPerSecond: windowResults.length / 5,
    avgResponseTime: windowTimes.length > 0 ? windowTimes.reduce((a, b) => a + b, 0) / windowTimes.length : 0,
    errorRate: windowResults.length > 0 ? (windowFailed / windowResults.length) * 100 : 0,
    concurrency: currentConcurrency,
    p95: calculatePercentile(windowTimes, 95),
    p99: calculatePercentile(windowTimes, 99),
    status2xx: windowResults.filter(r => r.statusCode >= 200 && r.statusCode < 300).length,
    status4xx: windowResults.filter(r => r.statusCode >= 400 && r.statusCode < 500).length,
    status5xx: windowResults.filter(r => r.statusCode >= 500).length,
    status429: windowResults.filter(r => r.statusCode === 429).length,
  }

  const timeSeries = [...previousTimeSeries, newPoint].slice(-120) // keep last 120 points

  return {
    testId,
    timestamp: now,
    elapsed,
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    requestsPerSecond: rps,
    currentConcurrency,
    avgResponseTime: avgTime,
    minResponseTime: times[0] ?? 0,
    maxResponseTime: times[times.length - 1] ?? 0,
    p50: calculatePercentile(times, 50),
    p75: calculatePercentile(times, 75),
    p90: calculatePercentile(times, 90),
    p95: calculatePercentile(times, 95),
    p99: calculatePercentile(times, 99),
    p999: calculatePercentile(times, 99.9),
    status2xx: s2xx,
    status3xx: s3xx,
    status4xx: s4xx,
    status5xx: s5xx,
    status429: s429,
    timeouts,
    connectionFailures: connFails,
    rateLimitedRequests: s429,
    errorRate: results.length > 0 ? (failed.length / results.length) * 100 : 0,
    errors,
    timeSeries,
    stressLevel,
  }
}

export function generateObservations(metrics: AggregatedMetrics, testType: string): string[] {
  const obs: string[] = []
  const { totalRequests, errorRate, status429, status5xx, timeouts, p95, p99, avgResponseTime, requestsPerSecond } = metrics

  if (totalRequests === 0) return ['No requests were completed.']

  // Success rate
  const successRate = 100 - errorRate
  if (successRate >= 99) obs.push(`High success rate: ${successRate.toFixed(2)}% of requests completed successfully.`)
  else if (successRate >= 95) obs.push(`Good success rate: ${successRate.toFixed(2)}% of requests completed successfully.`)
  else if (successRate >= 90) obs.push(`Moderate success rate: ${successRate.toFixed(2)}% — elevated failure rate detected.`)
  else obs.push(`Low success rate: ${successRate.toFixed(2)}% — significant failures observed.`)

  // Latency observations
  obs.push(`Average response time: ${avgResponseTime.toFixed(0)}ms. p95: ${p95.toFixed(0)}ms. p99: ${p99.toFixed(0)}ms.`)

  if (p99 > 5000) obs.push(`p99 latency exceeded 5 seconds (${p99.toFixed(0)}ms) — severe tail latency detected.`)
  else if (p99 > 2000) obs.push(`p99 latency exceeded 2 seconds (${p99.toFixed(0)}ms) — noticeable tail latency.`)
  else if (p95 > 1000) obs.push(`p95 latency exceeded 1 second (${p95.toFixed(0)}ms).`)

  // Rate limiting
  if (status429 > 0) {
    const pct = ((status429 / totalRequests) * 100).toFixed(1)
    obs.push(`Rate limiting detected: ${status429} HTTP 429 responses (${pct}% of total requests).`)
  }

  // Server errors
  if (status5xx > 0) {
    const pct = ((status5xx / totalRequests) * 100).toFixed(1)
    if (status5xx > totalRequests * 0.05) {
      obs.push(`Elevated server errors: ${status5xx} HTTP 5xx responses (${pct}%) — target may be under stress.`)
    } else {
      obs.push(`Server errors observed: ${status5xx} HTTP 5xx responses (${pct}%).`)
    }
  }

  // Timeouts
  if (timeouts > 0) {
    const pct = ((timeouts / totalRequests) * 100).toFixed(1)
    obs.push(`${timeouts} requests timed out (${pct}% of total).`)
  }

  // Throughput
  obs.push(`Throughput: ${requestsPerSecond.toFixed(1)} requests/second.`)

  // Test-specific
  if (testType === 'stress') {
    obs.push('Stress test: concurrency was increased progressively. Review the time series for breakpoints where error rate or latency increased significantly.')
  } else if (testType === 'spike') {
    obs.push('Spike test: traffic was suddenly increased then returned to baseline. Check the time series for recovery behavior.')
  } else if (testType === 'rate-limit') {
    obs.push('Rate limit test: requests were sent to observe rate limiting behavior. HTTP 429 counts indicate the limit threshold.')
  } else if (testType === 'endurance') {
    obs.push('Endurance test: sustained load was applied over time. Review the time series for any gradual degradation patterns.')
  } else if (testType === 'breakpoint') {
    if (metrics.aborted && metrics.breakingPoint) {
      obs.push(`BREAKING POINT TRIPPED at ${new Date(metrics.breakingPoint.timestamp).toLocaleTimeString()}: ${metrics.breakingPoint.reason} (Load: ${metrics.breakingPoint.rps.toLocaleString()} RPS at ${metrics.breakingPoint.concurrency.toLocaleString()} VUs).`)
    } else {
      obs.push(`Target survived the full extreme burst duration without tripping abort thresholds. Peak throughput achieved: ${(metrics.achievedRps ?? Math.round(requestsPerSecond)).toLocaleString()} RPS.`)
    }
    if (metrics.bottleneckHint) {
      obs.push(`Bottleneck diagnosis: ${metrics.bottleneckHint}`)
    }
    if (metrics.honestyCheck) {
      obs.push(`Test-rig honesty check: ${metrics.honestyCheck.message}`)
    }
    if (metrics.recoveryTimeMs && metrics.recoveryTimeMs > 0) {
      obs.push(`Estimated post-burst recovery time: ${(metrics.recoveryTimeMs / 1000).toFixed(1)}s.`)
    }
  }

  return obs
}
