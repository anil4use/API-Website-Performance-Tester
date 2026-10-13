import { Worker } from 'worker_threads'
import path from 'path'
import crypto from 'crypto'
function uuidv4() { return crypto.randomUUID() }
import { aggregateResults, generateObservations } from '../metrics'
import { getAgentRegistry } from './agent-registry'
import { evaluateAndSplitLoad } from './load-splitter'
import type {
  TestConfig, TestRun, AggregatedMetrics, TestReport,
  RequestResult, WorkerMessage, TimeSeriesPoint, TestStatus,
} from '../types'

export interface LogEntry {
  ts: number        // timestamp ms
  s: number         // status code
  l: number         // latency ms
  e: string | null  // error
  sz?: number       // response size bytes
  bs?: string       // body snippet (first ~150 chars)
}

interface ActiveTest {
  run: TestRun
  worker: Worker | null
  allResults: RequestResult[]
  timeSeries: TimeSeriesPoint[]
  startedAt: number
  currentConcurrency: number
  stressLevel?: number
  lastMetricsSnapshot: AggregatedMetrics | null
  logBuffer: LogEntry[]
  breakingPoint?: any
  aborted?: boolean
  abortReason?: string
  peakAchievedRps: number
  peakAchievedVUs: number
  agentMetrics: Record<string, {
    agentId: string
    name: string
    rps: number
    requests: number
    errors: number
    avgLatency: number
  }>
  honestyCheck?: any
  bottleneckHint?: string
  recoveryTimeMs?: number
  report?: TestReport
}

// Module-level singleton (persists for the lifetime of the Next.js server process)
class TestOrchestrator {
  private active = new Map<string, ActiveTest>()

  async createAndStart(config: TestConfig): Promise<TestRun> {
    const id = config.id || uuidv4()
    config.id = id
    const now = Date.now()

    const run: TestRun = {
      id,
      config,
      status: 'running',
      startedAt: now,
    }

    const initialConcurrency =
      config.breakpoint?.targetVirtualUsers ??
      config.load?.concurrency ??
      config.stress?.levels?.[0] ??
      config.spike?.normalUsers ??
      1

    const active: ActiveTest = {
      run,
      worker: null,
      allResults: [],
      timeSeries: [],
      startedAt: now,
      currentConcurrency: initialConcurrency,
      lastMetricsSnapshot: null,
      logBuffer: [],
      peakAchievedRps: 0,
      // For breakpoint tests, start at 0 — will be updated from real peakInFlight reported by worker.
      // For other tests, use initialConcurrency (correct for load/stress/spike etc.).
      peakAchievedVUs: config.type === 'breakpoint' ? 0 : initialConcurrency,
      agentMetrics: {},
    }

    this.active.set(id, active)

    // Handle Breakpoint load distribution
    let localSliceVUs = config.breakpoint?.targetVirtualUsers || 10000
    let localSliceRps = config.breakpoint?.targetRequestsPerSecond || 50000

    if (config.type === 'breakpoint' && config.breakpoint) {
      const agentRegistry = getAgentRegistry()
      const splitResult = evaluateAndSplitLoad(
        config.breakpoint,
        agentRegistry.getConnectedAgents(),
        agentRegistry.getCalibratedRps()
      )

      const localSlice = splitResult.slices.find(s => s.isLocal)
      if (localSlice) {
        localSliceVUs = localSlice.virtualUsers
        localSliceRps = localSlice.targetRps
      }

      const remoteSlices = splitResult.slices.filter(s => !s.isLocal)
      if (remoteSlices.length > 0) {
        // Register remote agent metrics listener
        agentRegistry.registerMetricsListener(id, (batch) => {
          active.allResults.push(...batch.newResults)
          active.peakAchievedVUs = Math.max(
            active.peakAchievedVUs,
            active.currentConcurrency + batch.currentConcurrency
          )
          if (batch.logs?.length) {
            active.logBuffer.push(...batch.logs)
            if (active.logBuffer.length > 10000) active.logBuffer.splice(0, active.logBuffer.length - 10000)
          }

          const existing = active.agentMetrics[batch.agentId] || {
            agentId: batch.agentId,
            name: `Agent ${batch.agentId.slice(0, 6)}`,
            rps: 0,
            requests: 0,
            errors: 0,
            avgLatency: 0,
          }
          const errorsInBatch = batch.newResults.filter(r => r.statusCode === 0 || r.statusCode >= 400).length
          const avgBatchLat = batch.newResults.length > 0
            ? batch.newResults.reduce((a, b) => a + b.responseTime, 0) / batch.newResults.length
            : 0
          existing.requests += batch.newResults.length
          existing.errors += errorsInBatch
          existing.avgLatency = Math.round(avgBatchLat)
          existing.rps = Math.round(batch.newResults.length / 0.4)
          active.agentMetrics[batch.agentId] = existing

          const metrics = this.computeMetrics(id, active)
          active.timeSeries = metrics.timeSeries
          active.lastMetricsSnapshot = metrics
          active.run.metrics = metrics
        })

        agentRegistry.registerDoneListener(id, () => {
          // agent finished
        })

        // Dispatch load to remote agents
        agentRegistry.dispatchLoad(id, {
          testId: id,
          testType: config.type,
          url: config.target,
          method: config.request.method,
          headers: this.buildHeaders(config),
          body: config.request.body,
          timeout: config.request.timeout || 30000,
          breakpoint: config.breakpoint,
          bypass: config.bypass,
        }, splitResult.slices)
      }
    }

    this.spawnWorker(id, config, localSliceVUs, localSliceRps)
    return run
  }

  private buildHeaders(config: TestConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'APIPerfTester/1.0',
      ...config.request.headers,
    }
    const auth = config.request.auth
    if (auth?.type === 'bearer' && auth.token) {
      headers['Authorization'] = `Bearer ${auth.token}`
    } else if (auth?.type === 'basic' && auth.username) {
      headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password ?? ''}`).toString('base64')}`
    } else if (auth?.type === 'api-key' && auth.apiKey) {
      headers[auth.apiKeyHeader || 'X-API-Key'] = auth.apiKey
    }
    if (config.request.body && config.request.contentType && config.request.contentType !== 'none') {
      headers['Content-Type'] = config.request.contentType
    }
    return headers
  }

  private spawnWorker(
    testId: string,
    config: TestConfig,
    localSliceVUs?: number,
    localSliceRps?: number
  ): void {
    const active = this.active.get(testId)
    if (!active) return

    // Use plain JS worker for reliable cross-platform compatibility
    const workerPath = path.join(process.cwd(), 'src', 'workers', 'load-worker.js')

    const workerData = {
      testId,
      testType: config.type,
      url: config.target,
      method: config.request.method,
      headers: this.buildHeaders(config),
      body: config.request.body,
      timeout: config.request.timeout || 30000,
      load: config.load,
      stress: config.stress,
      spike: config.spike,
      endurance: config.endurance,
      rateLimit: config.rateLimit,
      breakpoint: config.breakpoint ? {
        ...config.breakpoint,
        targetVirtualUsers: localSliceVUs ?? config.breakpoint.targetVirtualUsers,
        targetRequestsPerSecond: localSliceRps ?? config.breakpoint.targetRequestsPerSecond,
      } : undefined,
      bypass: config.bypass,
    }

    let worker: Worker
    try {
      worker = new Worker(workerPath, { workerData })
    } catch (err: any) {
      active.run.status = 'failed'
      active.run.error = `Failed to spawn worker: ${err.message}`
      return
    }

    active.worker = worker

    worker.on('message', (msg: WorkerMessage) => {
      if (msg.type === 'metrics') {
        const { newResults, currentConcurrency, peakInFlight, stressLevel, breakingPoint, aborted, abortReason, logs } = msg.data as any
        active.allResults.push(...newResults)
        active.currentConcurrency = currentConcurrency
        // For breakpoint tests, track the real peak in-flight count (not the ramp target)
        if (peakInFlight !== undefined && active.run.config.type === 'breakpoint') {
          active.peakAchievedVUs = Math.max(active.peakAchievedVUs, peakInFlight)
        }
        if (stressLevel !== undefined) active.stressLevel = stressLevel
        if (breakingPoint) active.breakingPoint = breakingPoint
        if (aborted) {
          active.aborted = true
          active.abortReason = abortReason
          getAgentRegistry().stopTestOnAgents(testId)
        }
        if (logs?.length) {
          active.logBuffer.push(...logs)
          if (active.logBuffer.length > 10000) active.logBuffer.splice(0, active.logBuffer.length - 10000)
        }

        const metrics = this.computeMetrics(testId, active)
        active.timeSeries = metrics.timeSeries
        active.lastMetricsSnapshot = metrics
        active.run.metrics = metrics
      } else if (msg.type === 'done') {
        this.finalize(testId, msg.error)
      } else if (msg.type === 'aborted') {
        active.aborted = true
        active.abortReason = msg.reason
        if (msg.breakingPoint) active.breakingPoint = msg.breakingPoint
        getAgentRegistry().stopTestOnAgents(testId)
        this.finalize(testId, msg.reason)
      }
    })

    worker.on('error', (err) => {
      const a = this.active.get(testId)
      if (a) { a.run.status = 'failed'; a.run.error = err.message }
      this.finalize(testId, err.message)
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        const a = this.active.get(testId)
        if (a && a.run.status === 'running') {
          this.finalize(testId, `Worker exited with code ${code}`)
        }
      }
    })
  }

  private computeMetrics(testId: string, active: ActiveTest): AggregatedMetrics {
    const elapsed = Date.now() - active.startedAt
    const metrics = aggregateResults(
      testId,
      active.allResults,
      elapsed,
      active.currentConcurrency,
      active.timeSeries,
      active.stressLevel
    )

    active.peakAchievedRps = Math.max(active.peakAchievedRps, Math.round(metrics.requestsPerSecond))
    // For breakpoint: VU count is updated from worker's real peakInFlight — don't overwrite with currentConcurrency here.
    if (active.run.config.type !== 'breakpoint') {
      active.peakAchievedVUs = Math.max(active.peakAchievedVUs, active.currentConcurrency)
    }

    metrics.breakingPoint = active.breakingPoint
    metrics.aborted = active.aborted
    metrics.abortReason = active.abortReason
    metrics.agentMetrics = { ...active.agentMetrics }

    if (active.run.config.type === 'breakpoint' && active.run.config.breakpoint) {
      metrics.targetRps = active.run.config.breakpoint.targetRequestsPerSecond
      metrics.targetVirtualUsers = active.run.config.breakpoint.targetVirtualUsers
      metrics.achievedRps = active.peakAchievedRps
      metrics.achievedVirtualUsers = active.peakAchievedVUs
      metrics.honestyCheck = active.honestyCheck
      metrics.bottleneckHint = active.bottleneckHint
      metrics.recoveryTimeMs = active.recoveryTimeMs
    }

    return metrics
  }

  private async finalize(testId: string, error?: string): Promise<void> {
    const active = this.active.get(testId)
    if (!active) return

    const now = Date.now()
    active.run.completedAt = now

    // Stop and unregister any distributed remote agents
    getAgentRegistry().stopTestOnAgents(testId)
    getAgentRegistry().unregisterTest(testId)

    if (active.run.status === 'running') {
      active.run.status = error ? 'failed' : (active.aborted ? 'stopped' : 'completed')
      if (error) active.run.error = error
    }

    const elapsed = now - active.startedAt
    const metrics = this.computeMetrics(testId, active)
    active.run.metrics = metrics

    // Breakpoint-specific post-test heuristics
    if (active.run.config.type === 'breakpoint' && active.run.config.breakpoint) {
      const targetRps = active.run.config.breakpoint.targetRequestsPerSecond || 1
      const achievedRps = metrics.achievedRps || Math.round(metrics.requestsPerSecond)
      const ratio = targetRps > 0 ? achievedRps / targetRps : 1

      // 1. Honesty check
      if (ratio < 0.6) {
        metrics.honestyCheck = {
          discrepancy: true,
          achievedRps,
          targetRps,
          ratio,
          severity: ratio < 0.3 ? 'critical' : 'warning',
          message: `Achieved ${achievedRps.toLocaleString()} RPS vs target ${targetRps.toLocaleString()} RPS (${(ratio * 100).toFixed(1)}% of configured target). ${
            (active.run.config.breakpoint.distributedNodes || 1) <= 1
              ? 'Testing ran on a single node without remote agents (reached OS socket/NIC limits). Connect 2+ remote load agents to scale further.'
              : 'Target server connection backlog was saturated or network interface throttled.'
          }`,
        }
      } else {
        metrics.honestyCheck = {
          discrepancy: false,
          achievedRps,
          targetRps,
          ratio,
          severity: 'ok',
          message: `Achieved RPS (${achievedRps.toLocaleString()} RPS) met or closely approached the configured target (${targetRps.toLocaleString()} RPS).`,
        }
      }
      active.honestyCheck = metrics.honestyCheck

      // 2. Bottleneck diagnosis heuristic
      const totalErrors = metrics.failedRequests
      const timeoutErrors = metrics.timeouts + metrics.connectionFailures
      const s5xx = metrics.status5xx
      const s429 = metrics.status429

      if (totalErrors > 0) {
        if (s429 > totalErrors * 0.5) {
          metrics.bottleneckHint = 'Rate Limiter / WAF Detected: Target actively returned HTTP 429 to reject excess load. This is defensive throttling rather than an infrastructure crash.'
        } else if (timeoutErrors > totalErrors * 0.5) {
          metrics.bottleneckHint = 'Target OS / Network Socket Exhaustion: Dominated by connection timeouts and dropped sockets. Target server TCP backlog or CPU is fully saturated and cannot accept handshakes.'
        } else if (s5xx > totalErrors * 0.4) {
          metrics.bottleneckHint = 'Application-Level Collapse: Target accepted connections but returned 5xx Internal Server Errors. Primary causes: Database connection pool exhaustion, memory limit reached, or unhandled concurrency errors.'
        } else {
          metrics.bottleneckHint = 'Mixed Failures: High load resulted in both socket drops and HTTP error responses.'
        }
      } else {
        metrics.bottleneckHint = 'Target Survived: Zero failed requests detected during the extreme burst duration.'
      }
      active.bottleneckHint = metrics.bottleneckHint

      // 3. Recovery time
      if (active.breakingPoint) {
        metrics.recoveryTimeMs = Math.max(0, now - active.breakingPoint.timestamp)
        active.recoveryTimeMs = metrics.recoveryTimeMs
      }
    }

    const report: TestReport = {
      id: testId,
      testId,
      target: active.run.config.target,
      testType: active.run.config.type,
      testName: active.run.config.name,
      startedAt: active.startedAt,
      completedAt: now,
      duration: elapsed,
      config: active.run.config,
      metrics,
      observations: generateObservations(metrics, active.run.config.type),
      timeSeries: metrics.timeSeries,
    }
    active.report = report
  }

  stop(testId: string): boolean {
    const active = this.active.get(testId)
    if (!active) return false

    active.run.status = 'stopped'
    getAgentRegistry().stopTestOnAgents(testId)

    if (active.worker) {
      active.worker.postMessage({ type: 'stop' })
    }
    this.finalize(testId)
    return true
  }

  pause(testId: string): boolean {
    const active = this.active.get(testId)
    if (!active || active.run.status !== 'running') return false
    active.run.status = 'paused'
    active.worker?.postMessage({ type: 'pause' })
    return true
  }

  resume(testId: string): boolean {
    const active = this.active.get(testId)
    if (!active || active.run.status !== 'paused') return false
    active.run.status = 'running'
    active.worker?.postMessage({ type: 'resume' })
    return true
  }

  getStatus(testId: string): TestStatus | null {
    return this.active.get(testId)?.run.status ?? null
  }

  getRun(testId: string): TestRun | null {
    return this.active.get(testId)?.run ?? null
  }

  getMetrics(testId: string): AggregatedMetrics | null {
    const active = this.active.get(testId)
    if (!active) return null
    return active.lastMetricsSnapshot
  }

  getLogsFrom(testId: string, offset: number, limit = 200): { entries: LogEntry[], nextOffset: number } {
    const active = this.active.get(testId)
    if (!active) return { entries: [], nextOffset: offset }
    const entries = active.logBuffer.slice(offset, offset + limit)
    return { entries, nextOffset: offset + entries.length }
  }

  getReport(testId: string): TestReport | null {
    const active = this.active.get(testId)
    if (!active) return null
    if (active.report) return active.report

    const metrics = this.computeMetrics(testId, active)

    return {
      id: testId,
      testId,
      target: active.run.config.target,
      testType: active.run.config.type,
      testName: active.run.config.name,
      startedAt: active.startedAt,
      completedAt: active.run.completedAt ?? Date.now(),
      duration: (active.run.completedAt ?? Date.now()) - active.startedAt,
      config: active.run.config,
      metrics,
      observations: generateObservations(metrics, active.run.config.type),
      timeSeries: metrics.timeSeries,
    }
  }
}

// Singleton pattern for Next.js — persists across requests in the same process
declare global {
  // eslint-disable-next-line no-var
  var __orchestrator: TestOrchestrator | undefined
}

export function getOrchestrator(): TestOrchestrator {
  if (!global.__orchestrator) {
    global.__orchestrator = new TestOrchestrator()
  } else {
    Object.setPrototypeOf(global.__orchestrator, TestOrchestrator.prototype)
  }
  return global.__orchestrator
}
