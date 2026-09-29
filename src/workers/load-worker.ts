import { workerData, parentPort } from 'worker_threads'
import https from 'https'
import http from 'http'
import { URL } from 'url'
import type { WorkerConfig, RequestResult } from '../lib/types'

const config: WorkerConfig = workerData

let stopped = false
let paused = false
const results: RequestResult[] = []
let totalSent = 0
let currentConcurrency = 0
let activeSlots = 0

parentPort?.on('message', (msg: { type: string }) => {
  if (msg.type === 'stop') stopped = true
  if (msg.type === 'pause') paused = true
  if (msg.type === 'resume') paused = false
})

async function runSingleRequest(): Promise<RequestResult> {
  const start = performance.now()
  let statusCode = 0
  let responseSize = 0
  let error: string | undefined
  let isTimeout = false
  let isConnectionFailure = false

  let url: URL
  try {
    url = new URL(config.url)
  } catch {
    return {
      timestamp: Date.now(), statusCode: 0, responseTime: 0,
      responseSize: 0, error: 'Invalid URL', isTimeout: false, isConnectionFailure: true,
    }
  }

  const isHttps = url.protocol === 'https:'
  const lib = isHttps ? https : http
  const timeout = config.timeout || 30000

  await new Promise<void>((resolve) => {
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: config.method,
      headers: config.headers,
      timeout,
    }

    const req = lib.request(options, (res) => {
      statusCode = res.statusCode ?? 0
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        responseSize = chunks.reduce((acc, c) => acc + c.length, 0)
        resolve()
      })
      res.on('error', () => { isConnectionFailure = true; resolve() })
    })

    req.on('timeout', () => {
      isTimeout = true
      error = 'timeout'
      req.destroy()
      resolve()
    })

    req.on('error', (err) => {
      isConnectionFailure = true
      error = err.message
      resolve()
    })

    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      req.write(config.body)
    }
    req.end()
  })

  const responseTime = performance.now() - start
  return { timestamp: Date.now(), statusCode, responseTime, responseSize, error, isTimeout, isConnectionFailure }
}

async function waitWhilePaused(): Promise<void> {
  while (paused && !stopped) {
    await new Promise(r => setTimeout(r, 100))
  }
}

// Send metrics batch every 500ms
let lastMetricsSend = Date.now()
let pendingResults: RequestResult[] = []

function maybeSendMetrics(force = false): void {
  const now = Date.now()
  if (force || now - lastMetricsSend >= 500) {
    const toSend = pendingResults.splice(0)
    if (toSend.length > 0 || force) {
      parentPort?.postMessage({
        type: 'metrics',
        data: { newResults: toSend, currentConcurrency, stressLevel: config.stress?.levels?.[0] },
      })
    }
    lastMetricsSend = now
  }
}

async function runLoadTest(): Promise<void> {
  const { load } = config
  if (!load) return

  const concurrency = load.concurrency
  const totalRequests = load.totalRequests ?? Infinity
  const durationMs = load.duration ? load.duration * 1000 : Infinity
  const rampUpMs = (load.rampUpTime ?? 0) * 1000
  const startTime = Date.now()

  currentConcurrency = rampUpMs > 0 ? 1 : concurrency

  // Ramp up gradually
  let rampTimer: ReturnType<typeof setInterval> | null = null
  if (rampUpMs > 0) {
    const steps = Math.min(concurrency, 20)
    const stepInterval = rampUpMs / steps
    const stepSize = Math.ceil(concurrency / steps)
    rampTimer = setInterval(() => {
      currentConcurrency = Math.min(currentConcurrency + stepSize, concurrency)
      if (currentConcurrency >= concurrency && rampTimer) {
        clearInterval(rampTimer)
        rampTimer = null
      }
    }, stepInterval)
  }

  // Run slots
  const runSlot = async (): Promise<void> => {
    activeSlots++
    while (!stopped) {
      if (paused) { await waitWhilePaused(); continue }
      if (totalSent >= totalRequests) break
      if (Date.now() - startTime > durationMs) break
      if (activeSlots > currentConcurrency) { await new Promise(r => setTimeout(r, 10)); continue }

      totalSent++
      const result = await runSingleRequest()
      pendingResults.push(result)
      results.push(result)
      maybeSendMetrics()
    }
    activeSlots--
  }

  const slots = Array.from({ length: concurrency }, () => runSlot())
  await Promise.all(slots)

  if (rampTimer) clearInterval(rampTimer)
  maybeSendMetrics(true)
}

async function runStressTest(): Promise<void> {
  const { stress } = config
  if (!stress) return

  const levels = stress.levels || [10, 25, 50, 100, 250, 500, 1000]
  const levelDurationMs = (stress.levelDuration ?? 30) * 1000

  for (const level of levels) {
    if (stopped) break

    currentConcurrency = level
    parentPort?.postMessage({ type: 'metrics', data: { newResults: [], currentConcurrency, stressLevel: level } })

    const levelStart = Date.now()
    activeSlots = 0

    const runSlot = async (): Promise<void> => {
      activeSlots++
      while (!stopped && Date.now() - levelStart < levelDurationMs) {
        if (paused) { await waitWhilePaused(); continue }
        totalSent++
        const result = await runSingleRequest()
        pendingResults.push(result)
        results.push(result)
        maybeSendMetrics()
      }
      activeSlots--
    }

    const slots = Array.from({ length: level }, () => runSlot())
    await Promise.all(slots)
  }

  maybeSendMetrics(true)
}

async function runSpikeTest(): Promise<void> {
  const { spike } = config
  if (!spike) return

  const { normalUsers, spikeUsers, normalDuration, spikeDuration, recoveryDuration } = spike

  // Phase 1: Normal
  currentConcurrency = normalUsers
  await runPhase(normalUsers, normalDuration * 1000)
  if (stopped) { maybeSendMetrics(true); return }

  // Phase 2: Spike
  currentConcurrency = spikeUsers
  parentPort?.postMessage({ type: 'metrics', data: { newResults: [], currentConcurrency: spikeUsers, stressLevel: undefined } })
  await runPhase(spikeUsers, spikeDuration * 1000)
  if (stopped) { maybeSendMetrics(true); return }

  // Phase 3: Recovery
  currentConcurrency = normalUsers
  parentPort?.postMessage({ type: 'metrics', data: { newResults: [], currentConcurrency: normalUsers, stressLevel: undefined } })
  await runPhase(normalUsers, recoveryDuration * 1000)

  maybeSendMetrics(true)
}

async function runPhase(concurrency: number, durationMs: number): Promise<void> {
  const phaseStart = Date.now()
  activeSlots = 0

  const runSlot = async (): Promise<void> => {
    activeSlots++
    while (!stopped && Date.now() - phaseStart < durationMs) {
      if (paused) { await waitWhilePaused(); continue }
      totalSent++
      const result = await runSingleRequest()
      pendingResults.push(result)
      results.push(result)
      maybeSendMetrics()
    }
    activeSlots--
  }

  await Promise.all(Array.from({ length: concurrency }, () => runSlot()))
}

async function runEnduranceTest(): Promise<void> {
  const { endurance } = config
  if (!endurance) return

  currentConcurrency = endurance.concurrency
  const durationMs = endurance.duration * 1000
  const startTime = Date.now()
  activeSlots = 0

  const runSlot = async (): Promise<void> => {
    activeSlots++
    while (!stopped && Date.now() - startTime < durationMs) {
      if (paused) { await waitWhilePaused(); continue }
      totalSent++
      const result = await runSingleRequest()
      pendingResults.push(result)
      results.push(result)
      maybeSendMetrics()
    }
    activeSlots--
  }

  await Promise.all(Array.from({ length: endurance.concurrency }, () => runSlot()))
  maybeSendMetrics(true)
}

async function runRateLimitTest(): Promise<void> {
  const { rateLimit } = config
  if (!rateLimit) return

  currentConcurrency = rateLimit.concurrency
  const total = rateLimit.totalRequests
  activeSlots = 0

  const runSlot = async (): Promise<void> => {
    activeSlots++
    while (!stopped && totalSent < total) {
      if (paused) { await waitWhilePaused(); continue }
      totalSent++
      const result = await runSingleRequest()
      pendingResults.push(result)
      results.push(result)
      maybeSendMetrics()
    }
    activeSlots--
  }

  await Promise.all(Array.from({ length: rateLimit.concurrency }, () => runSlot()))
  maybeSendMetrics(true)
}

// Main entry
;(async () => {
  try {
    switch (config.testType) {
      case 'load': await runLoadTest(); break
      case 'stress': await runStressTest(); break
      case 'spike': await runSpikeTest(); break
      case 'endurance': await runEnduranceTest(); break
      case 'rate-limit': await runRateLimitTest(); break
      default: await runLoadTest()
    }
    parentPort?.postMessage({ type: 'done' })
  } catch (err: any) {
    parentPort?.postMessage({ type: 'done', error: err.message })
  }
})()
