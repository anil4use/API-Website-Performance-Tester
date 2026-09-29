import { Worker } from 'worker_threads'
import path from 'path'
import crypto from 'crypto'
function uuidv4() { return crypto.randomUUID() }
import { aggregateResults, generateObservations } from '../metrics'
import { saveTestResult } from '../db'
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

    const active: ActiveTest = {
      run,
      worker: null,
      allResults: [],
      timeSeries: [],
      startedAt: now,
      currentConcurrency: config.load?.concurrency ?? config.stress?.levels?.[0] ?? config.spike?.normalUsers ?? 1,
      lastMetricsSnapshot: null,
      logBuffer: [],
    }

    this.active.set(id, active)
    this.spawnWorker(id, config)
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

  private spawnWorker(testId: string, config: TestConfig): void {
    const active = this.active.get(testId)
    if (!active) return

    // Use the plain JS worker for reliable cross-platform compatibility
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
        const { newResults, currentConcurrency, stressLevel, logs } = msg.data as any
        active.allResults.push(...newResults)
        active.currentConcurrency = currentConcurrency
        if (stressLevel !== undefined) active.stressLevel = stressLevel
        if (logs?.length) {
          active.logBuffer.push(...logs)
          if (active.logBuffer.length > 10000) active.logBuffer.splice(0, active.logBuffer.length - 10000)
        }

        const elapsed = Date.now() - active.startedAt
        const metrics = aggregateResults(testId, active.allResults, elapsed, currentConcurrency, active.timeSeries, stressLevel)
        active.timeSeries = metrics.timeSeries
        active.lastMetricsSnapshot = metrics
        active.run.metrics = metrics
      } else if (msg.type === 'done') {
        this.finalize(testId, msg.error)
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

  private async finalize(testId: string, error?: string): Promise<void> {
    const active = this.active.get(testId)
    if (!active) return

    const now = Date.now()
    active.run.completedAt = now

    if (active.run.status === 'running') {
      active.run.status = error ? 'failed' : 'completed'
      if (error) active.run.error = error
    }

    const elapsed = now - active.startedAt
    const metrics = aggregateResults(
      testId,
      active.allResults,
      elapsed,
      active.currentConcurrency,
      active.timeSeries,
      active.stressLevel
    )
    active.run.metrics = metrics

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

    // Persist to MongoDB
    try {
      await saveTestResult(report)
    } catch (dbErr: any) {
      console.error('Failed to save test result:', dbErr.message)
    }
  }

  stop(testId: string): boolean {
    const active = this.active.get(testId)
    if (!active) return false

    active.run.status = 'stopped'
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

    const { run, allResults, timeSeries, startedAt, currentConcurrency, stressLevel } = active
    const elapsed = (run.completedAt ?? Date.now()) - startedAt
    const metrics = aggregateResults(testId, allResults, elapsed, currentConcurrency, timeSeries, stressLevel)

    return {
      id: testId,
      testId,
      target: run.config.target,
      testType: run.config.type,
      testName: run.config.name,
      startedAt,
      completedAt: run.completedAt ?? Date.now(),
      duration: elapsed,
      config: run.config,
      metrics,
      observations: generateObservations(metrics, run.config.type),
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
  }
  return global.__orchestrator
}
