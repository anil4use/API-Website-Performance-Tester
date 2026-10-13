// Load worker — plain JS for reliable worker_threads compatibility
const { workerData, parentPort } = require('worker_threads')
const https = require('https')
const http = require('http')
const { URL } = require('url')

// CRITICAL: Node.js defaults to maxSockets=5 which throttles concurrency to a crawl.
// Set to Infinity so all concurrent requests fire simultaneously.
http.globalAgent = new http.Agent({ maxSockets: Infinity, keepAlive: false })
https.globalAgent = new https.Agent({ maxSockets: Infinity, keepAlive: false })

const config = workerData

let stopped = false
let paused = false
let totalSent = 0
let currentConcurrency = 0
let activeSlots = 0

parentPort.on('message', (msg) => {
  if (msg.type === 'stop') stopped = true
  if (msg.type === 'pause') paused = true
  if (msg.type === 'resume') paused = false
})

// ── Global rate limiter (token bucket shared across all slots) ───────────────
let gTokens = Infinity
let gMaxTokens = Infinity
let gRefillPerMs = Infinity
let gLastRefill = 0

function initGlobalRateLimit() {
  // For breakpoint mode, we never rate-limit — we push as hard as possible and measure
  // what actually gets through. Rate limiting would defeat the purpose of a breakpoint test.
  if (config.testType === 'breakpoint') return

  // Support target RPS from bypass.maxRps, load.requestsPerSecond
  const rps = config.bypass?.maxRps ||
    config.load?.requestsPerSecond ||
    0

  if (rps && rps > 0) {
    gMaxTokens = rps
    gTokens = rps
    gRefillPerMs = rps / 1000
    gLastRefill = Date.now()
  }
}

async function acquireGlobalToken() {
  if (gMaxTokens === Infinity) return
  while (true) {
    const now = Date.now()
    const elapsed = now - gLastRefill
    gTokens = Math.min(gMaxTokens, gTokens + elapsed * gRefillPerMs)
    gLastRefill = now
    if (gTokens >= 1) {
      gTokens -= 1
      return
    }
    await sleep(2)
  }
}

// ── Bypass helpers ───────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Android 14; Mobile; rv:122.0) Gecko/122.0 Firefox/122.0',
  'PostmanRuntime/7.36.3',
  'axios/1.6.5',
  'python-httpx/0.26.0',
  'go-http-client/1.1',
  'node-fetch/3.3.2',
]

function randomPublicIp() {
  // Random public IP — avoid private/reserved ranges
  const first = [2,5,6,8,9,11,14,15,17,18,20,22,23,24,25,26,27,28,29,30,
    31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,
    54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,
    77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,
    100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,
    117,118,119,120,121,122,123,124,125,126,128,129,130,131,132,133,134,
    135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,
    152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,
    170,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,
    189,190,191,193,194,195,196,197,198,199,200,201,202,203,204,205,206,
    207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223]
  const a = first[Math.floor(Math.random() * first.length)]
  const b = Math.floor(Math.random() * 256)
  const c = Math.floor(Math.random() * 256)
  const d = Math.floor(Math.random() * 255) + 1
  return `${a}.${b}.${c}.${d}`
}

function buildBypassHeaders() {
  const bypass = config.bypass
  if (!bypass) return {}
  const extra = {}

  if (bypass.rotateIp) {
    const ip = randomPublicIp()
    extra['X-Forwarded-For'] = ip
    extra['X-Real-IP'] = ip
    extra['X-Client-IP'] = ip
    extra['CF-Connecting-IP'] = ip   // Cloudflare-style
    extra['True-Client-IP'] = ip     // Akamai/Cloudflare-style
  }

  if (bypass.rotateUserAgent) {
    extra['User-Agent'] = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
  }

  if (bypass.bypassHeader && bypass.bypassHeaderName) {
    if (bypass.rotateHeaderValue) {
      // Generate a fresh random token every request
      const rnd = new Uint8Array(12)
      for (let i = 0; i < 12; i++) rnd[i] = Math.floor(Math.random() * 256)
      extra[bypass.bypassHeaderName] = 'lte_' + Array.from(rnd).map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      extra[bypass.bypassHeaderName] = bypass.bypassHeaderValue || ''
    }
  }

  return extra
}

function runSingleRequest() {
  return new Promise((resolve) => {
    const start = performance.now()
    let statusCode = 0
    let responseSize = 0
    let error
    let isTimeout = false
    let isConnectionFailure = false

    let url
    try {
      url = new URL(config.url)
    } catch {
      resolve({ timestamp: Date.now(), statusCode: 0, responseTime: 0, responseSize: 0, error: 'Invalid URL', isTimeout: false, isConnectionFailure: true })
      return
    }

    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http
    const timeout = config.timeout || 30000

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: config.method || 'GET',
      headers: { ...config.headers, ...buildBypassHeaders() },
      timeout,
    }

    const req = lib.request(options, (res) => {
      statusCode = res.statusCode || 0
      // Parse Retry-After header (value in seconds)
      let retryAfter = 0
      const raHeader = res.headers['retry-after']
      if (raHeader) retryAfter = parseInt(raHeader) * 1000 || 0
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        responseSize = body.length
        const bodySnippet = body.toString('utf8', 0, 200).replace(/\s+/g, ' ').trim()
        const responseTime = performance.now() - start
        resolve({ timestamp: Date.now(), statusCode, responseTime, responseSize, bodySnippet, retryAfter, error, isTimeout: false, isConnectionFailure: false })
      })
      res.on('error', (err) => {
        const responseTime = performance.now() - start
        resolve({ timestamp: Date.now(), statusCode: 0, responseTime, responseSize: 0, error: err.message, isTimeout: false, isConnectionFailure: true })
      })
    })

    req.on('timeout', () => {
      isTimeout = true
      req.destroy()
      const responseTime = performance.now() - start
      resolve({ timestamp: Date.now(), statusCode: 0, responseTime, responseSize: 0, error: 'timeout', isTimeout: true, isConnectionFailure: false })
    })

    req.on('error', (err) => {
      const responseTime = performance.now() - start
      resolve({ timestamp: Date.now(), statusCode: 0, responseTime, responseSize: 0, error: err.message, isTimeout: false, isConnectionFailure: true })
    })

    if (config.body && config.method && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      req.write(config.body)
    }
    req.end()
  })
}

const pendingResults = []
const pendingLogs = []
let lastMetricsSend = Date.now()
let breakingPointMarker = null
let aborted = false
let abortReason = ''
let consecutiveTimeouts = 0
let peakInFlight = 0  // real max concurrent connections ever open simultaneously

function maybeSendMetrics(force) {
  const now = Date.now()
  if (force || now - lastMetricsSend >= 400) {
    const toSend = pendingResults.splice(0)
    const logs = pendingLogs.splice(0)
    parentPort.postMessage({
      type: 'metrics',
      data: {
        newResults: toSend,
        currentConcurrency,
        peakInFlight,  // actual max concurrent connections ever open (honest VU count)
        stressLevel: undefined,
        breakingPoint: breakingPointMarker,
        aborted,
        abortReason,
        logs,
      },
    })
    lastMetricsSend = now
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function waitWhilePaused() {
  while (paused && !stopped) {
    await sleep(100)
  }
}

// Shared: run one request with global rate limit, auto-retry on 429, and pacing delay
async function executeRequest() {
  // Wait for global rate limit token before firing
  await acquireGlobalToken()

  let result = await runSingleRequest()

  // Auto-retry on 429 — up to 3 attempts, respects Retry-After header
  if (result.statusCode === 429 && config.bypass?.retryOn429) {
    for (let attempt = 0; attempt < 3 && result.statusCode === 429; attempt++) {
      // Prefer server's Retry-After over our configured delay
      const wait = result.retryAfter > 0
        ? result.retryAfter
        : (config.bypass.retryDelay > 0 ? config.bypass.retryDelay : 1000) * (attempt + 1)
      await sleep(wait)
      await acquireGlobalToken()
      result = await runSingleRequest()
    }
  }

  pendingResults.push(result)
  pendingLogs.push({
    ts: result.timestamp,
    s: result.statusCode,
    l: Math.round(result.responseTime),
    e: result.error || null,
    sz: result.responseSize,
    bs: result.bodySnippet || null,
  })
  maybeSendMetrics()

  // Per-slot pacing delay
  if (config.bypass?.requestDelay > 0) {
    await sleep(config.bypass.requestDelay)
  }

  return result
}

async function runLoadTest() {
  const load = config.load
  if (!load) return

  const concurrency = load.concurrency || 10
  const totalRequests = load.totalRequests || Infinity
  const durationMs = load.duration ? load.duration * 1000 : Infinity
  const rampUpMs = (load.rampUpTime || 0) * 1000
  const rampDownMs = (load.rampDownTime || 0) * 1000
  const startTime = Date.now()

  currentConcurrency = rampUpMs > 0 ? 1 : concurrency

  // Ramp up timer
  let rampTimer = null
  if (rampUpMs > 0) {
    const steps = Math.min(concurrency, 20)
    const stepInterval = rampUpMs / steps
    const stepSize = Math.ceil(concurrency / steps)
    rampTimer = setInterval(() => {
      currentConcurrency = Math.min(currentConcurrency + stepSize, concurrency)
      if (currentConcurrency >= concurrency) {
        clearInterval(rampTimer)
        rampTimer = null
      }
    }, stepInterval)
  }

  // Ramp down timer (triggered when approaching end of duration)
  let rampDownTimer = null
  let rampDownScheduled = null
  if (rampDownMs > 0 && durationMs < Infinity && durationMs > rampDownMs) {
    const rampDownStartOffset = durationMs - rampDownMs
    rampDownScheduled = setTimeout(() => {
      const steps = Math.min(concurrency, 20)
      const stepInterval = rampDownMs / steps
      const stepSize = Math.max(1, Math.floor(concurrency / steps))
      rampDownTimer = setInterval(() => {
        currentConcurrency = Math.max(1, currentConcurrency - stepSize)
        if (currentConcurrency <= 1) {
          clearInterval(rampDownTimer)
          rampDownTimer = null
        }
      }, stepInterval)
    }, rampDownStartOffset)
  }

  async function runSlot() {
    activeSlots++
    while (!stopped) {
      if (paused) { await waitWhilePaused(); continue }
      if (totalSent >= totalRequests) break
      if (Date.now() - startTime > durationMs) break
      if (activeSlots > currentConcurrency) { await sleep(10); continue }
      totalSent++
      await executeRequest()
    }
    activeSlots--
  }

  await Promise.all(Array.from({ length: concurrency }, () => runSlot()))
  if (rampTimer) clearInterval(rampTimer)
  if (rampDownTimer) clearInterval(rampDownTimer)
  if (rampDownScheduled) clearTimeout(rampDownScheduled)
  maybeSendMetrics(true)
}

async function runPhase(concurrency, durationMs) {
  const phaseStart = Date.now()
  activeSlots = 0

  async function runSlot() {
    activeSlots++
    while (!stopped && Date.now() - phaseStart < durationMs) {
      if (paused) { await waitWhilePaused(); continue }
      totalSent++
      await executeRequest()
    }
    activeSlots--
  }

  await Promise.all(Array.from({ length: concurrency }, () => runSlot()))
}

async function runStressTest() {
  const stress = config.stress
  if (!stress) return

  const levels = stress.levels || [10, 25, 50, 100, 250, 500]
  const levelDurationMs = (stress.levelDuration || 30) * 1000
  const rampBetweenMs = (stress.rampBetweenLevels || 0) * 1000

  for (let i = 0; i < levels.length; i++) {
    if (stopped) break
    const level = levels[i]

    // If rampBetweenLevels is configured and not the first level, smoothly ramp from previous level
    if (rampBetweenMs > 0 && i > 0) {
      const prevLevel = levels[i - 1]
      const rampStart = Date.now()
      const rampSlots = Math.max(prevLevel, level)
      activeSlots = 0

      async function rampSlot() {
        activeSlots++
        while (!stopped && Date.now() - rampStart < rampBetweenMs) {
          if (paused) { await waitWhilePaused(); continue }
          const progress = Math.min(1, (Date.now() - rampStart) / rampBetweenMs)
          currentConcurrency = Math.round(prevLevel + (level - prevLevel) * progress)
          if (activeSlots > currentConcurrency) { await sleep(10); continue }
          totalSent++
          await executeRequest()
        }
        activeSlots--
      }

      await Promise.all(Array.from({ length: rampSlots }, () => rampSlot()))
      if (stopped) break
    }

    currentConcurrency = level
    parentPort.postMessage({ type: 'metrics', data: { newResults: [], currentConcurrency: level, stressLevel: level } })
    await runPhase(level, levelDurationMs)
  }
  maybeSendMetrics(true)
}

async function runSpikeTest() {
  const spike = config.spike
  if (!spike) return
  currentConcurrency = spike.normalUsers
  await runPhase(spike.normalUsers, spike.normalDuration * 1000)
  if (stopped) { maybeSendMetrics(true); return }
  currentConcurrency = spike.spikeUsers
  parentPort.postMessage({ type: 'metrics', data: { newResults: [], currentConcurrency: spike.spikeUsers, stressLevel: undefined } })
  await runPhase(spike.spikeUsers, spike.spikeDuration * 1000)
  if (stopped) { maybeSendMetrics(true); return }
  currentConcurrency = spike.normalUsers
  parentPort.postMessage({ type: 'metrics', data: { newResults: [], currentConcurrency: spike.normalUsers, stressLevel: undefined } })
  await runPhase(spike.normalUsers, spike.recoveryDuration * 1000)
  maybeSendMetrics(true)
}

async function runEnduranceTest() {
  const endurance = config.endurance
  if (!endurance) return
  currentConcurrency = endurance.concurrency
  await runPhase(endurance.concurrency, endurance.duration * 1000)
  maybeSendMetrics(true)
}

async function runRateLimitTest() {
  const rl = config.rateLimit
  if (!rl) return
  currentConcurrency = rl.concurrency

  async function runSlot() {
    activeSlots++
    while (!stopped && totalSent < rl.totalRequests) {
      if (paused) { await waitWhilePaused(); continue }
      totalSent++
      await executeRequest()
    }
    activeSlots--
  }

  await Promise.all(Array.from({ length: rl.concurrency }, () => runSlot()))
  maybeSendMetrics(true)
}

async function runBreakpointTest() {
  const bp = config.breakpoint
  if (!bp) return

  const targetVUs = bp.targetVirtualUsers || 10000
  const burstDurationMs = (bp.burstDurationSeconds || 5) * 1000
  const abortConds = bp.abortConditions || { maxErrorRatePercent: 50, maxP99LatencyMs: 30000, consecutiveTimeoutLimit: 500 }
  const rampStrategy = bp.rampStrategy || 'instant'

  // ── Persistent keep-alive connection pool ─────────────────────────────────
  // With keepAlive:false (the default), every request = a fresh TLS handshake.
  // Cloudflare / CDNs see this as a SYN flood and hold each connection for
  // 7-10 seconds before RST-ing it ("slow reset" DDoS defense).
  //
  // With keepAlive:true and a controlled pool size, we reuse connections:
  //   - Far fewer TLS handshakes = lower per-request overhead
  //   - CDN sees steady HTTP traffic, not a SYN flood — much less aggressive blocking
  //   - Each persistent connection can serve many requests in sequence
  //   - Realistic throughput: pool_size × (1000ms / avg_RTT_ms) = RPS estimate
  //
  // Pool size: min(targetVUs, 5000). For a public HTTPS site:
  //   500 connections × (1000ms / 200ms RTT) ≈ 2,500 RPS
  //   5000 connections × (1000ms / 200ms RTT) ≈ 25,000 RPS (if server keeps up)
  const bpPoolSize = Math.min(targetVUs, 5000)
  const bpHttpsAgent = new https.Agent({
    maxSockets: bpPoolSize,
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxFreeSockets: Math.min(bpPoolSize, 1000),
    scheduling: 'lifo',
  })
  const bpHttpAgent = new http.Agent({
    maxSockets: bpPoolSize,
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxFreeSockets: Math.min(bpPoolSize, 1000),
    scheduling: 'lifo',
  })
  // Temporarily override global agents for this test
  const prevHttpsAgent = https.globalAgent
  const prevHttpAgent = http.globalAgent
  https.globalAgent = bpHttpsAgent
  http.globalAgent = bpHttpAgent

  const startTime = Date.now()
  const burstEndTime = startTime + burstDurationMs
  let inFlight = 0
  let recentWindow = []

  // Concurrency initialization
  if (rampStrategy === 'instant') {
    currentConcurrency = targetVUs
  } else {
    currentConcurrency = 1
  }

  // Micro-ramp timers
  let rampTimer = null
  if (rampStrategy === 'ramp_100ms') {
    const rampStart = Date.now()
    rampTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - rampStart) / 100)
      currentConcurrency = Math.max(1, Math.floor(targetVUs * progress))
      if (progress >= 1) {
        clearInterval(rampTimer)
        rampTimer = null
      }
    }, 10)
  } else if (rampStrategy === 'ramp_1s') {
    const rampStart = Date.now()
    rampTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - rampStart) / 1000)
      currentConcurrency = Math.max(1, Math.floor(targetVUs * progress))
      if (progress >= 1) {
        clearInterval(rampTimer)
        rampTimer = null
      }
    }, 25)
  }

  // 250ms Abort Condition Monitor
  const abortMonitor = setInterval(() => {
    if (stopped) return

    const now = Date.now()
    recentWindow = recentWindow.filter(r => now - r.ts <= 1500)
    if (recentWindow.length >= 10) {
      const failed = recentWindow.filter(r => r.statusCode === 0 || r.statusCode >= 400).length
      const errorRate = (failed / recentWindow.length) * 100

      const sortedTimes = recentWindow.map(r => r.responseTime).sort((a, b) => a - b)
      const p99Idx = Math.max(0, Math.ceil(0.99 * sortedTimes.length) - 1)
      const p99 = sortedTimes[p99Idx] || 0

      const windowSec = Math.max(0.2, (now - (recentWindow[0]?.ts || now)) / 1000)
      const currentRps = recentWindow.length / windowSec

      let tripped = false
      let reason = ''

      if (abortConds.maxErrorRatePercent > 0 && errorRate > abortConds.maxErrorRatePercent) {
        tripped = true
        reason = `Auto-abort: Error rate reached ${errorRate.toFixed(1)}% (limit: ${abortConds.maxErrorRatePercent}%)`
      } else if (abortConds.maxP99LatencyMs > 0 && p99 > abortConds.maxP99LatencyMs) {
        tripped = true
        reason = `Auto-abort: p99 latency reached ${Math.round(p99)}ms (limit: ${abortConds.maxP99LatencyMs}ms)`
      } else if (abortConds.consecutiveTimeoutLimit > 0 && consecutiveTimeouts >= abortConds.consecutiveTimeoutLimit) {
        tripped = true
        reason = `Auto-abort: Consecutive timeouts reached ${consecutiveTimeouts} (limit: ${abortConds.consecutiveTimeoutLimit})`
      }

      if (tripped) {
        stopped = true
        aborted = true
        abortReason = reason
        breakingPointMarker = {
          timestamp: now,
          rps: Math.round(currentRps),
          concurrency: currentConcurrency,
          reason,
          errorRate,
          p99,
          consecutiveTimeouts,
        }
        clearInterval(abortMonitor)
        if (rampTimer) clearInterval(rampTimer)
      }
    }
  }, 250)

  // ── True fire-and-forget concurrency dispatcher ──────────────────────────────
  // Instead of N sequential slots each awaiting one request at a time,
  // we fire requests as fast as the event loop allows and track in-flight count.
  // This is the only way to approach the configured RPS from a single process.
  //
  // Hard cap: Node.js is physically limited to ~5,000-15,000 concurrent outbound
  // HTTPS connections before the OS/NIC becomes the bottleneck. We respect that
  // by capping in-flight at min(targetVUs, bpPoolSize). The actual achieved RPS will
  // be bounded by: min(targetRps, inFlight / avgLatencySeconds).
  const MAX_INFLIGHT = bpPoolSize

  async function fireLoop() {
    while (!stopped && Date.now() < burstEndTime) {
      if (paused) { await waitWhilePaused(); continue }

      // Respect ramp strategy: if ramp is still climbing, cap in-flight to currentConcurrency
      if (inFlight >= Math.min(currentConcurrency, MAX_INFLIGHT)) {
        // Yield to let the event loop process completions
        await sleep(1)
        continue
      }

      totalSent++
      inFlight++
      if (inFlight > peakInFlight) peakInFlight = inFlight  // track real peak

      // Fire request without awaiting — true non-blocking dispatch
      runSingleRequest().then((res) => {
        inFlight--
        pendingResults.push(res)
        pendingLogs.push({
          ts: res.timestamp,
          s: res.statusCode,
          l: Math.round(res.responseTime),
          e: res.error || null,
          sz: res.responseSize,
          bs: res.bodySnippet || null,
        })
        recentWindow.push({
          ts: res.timestamp,
          statusCode: res.statusCode,
          responseTime: res.responseTime,
          isTimeout: res.isTimeout,
        })
        if (res.isTimeout) {
          consecutiveTimeouts++
        } else {
          consecutiveTimeouts = 0
        }
        maybeSendMetrics()
      }).catch(() => {
        inFlight--
      })
    }
  }

  // Run multiple parallel fire-loops to overcome single-loop event tick limits
  // Each loop independently checks in-flight count, so they cooperate naturally.
  const NUM_FIRE_LOOPS = Math.min(32, Math.max(4, Math.ceil(targetVUs / 1000)))
  await Promise.all(Array.from({ length: NUM_FIRE_LOOPS }, () => fireLoop()))

  clearInterval(abortMonitor)
  if (rampTimer) clearInterval(rampTimer)

  // Graceful drain — wait until all in-flight requests complete (or request timeout expires).
  // CRITICAL: With an external site like Cloudflare that holds connections for 7-10s before
  // RST-ing them, we MUST wait at least that long or fired requests are silently discarded.
  const drainMs = Math.max(15000, config.timeout || 30000)
  const drainDeadline = Date.now() + drainMs
  while (inFlight > 0 && Date.now() < drainDeadline) {
    await sleep(100)
  }

  // Restore original agents
  https.globalAgent = prevHttpsAgent
  http.globalAgent = prevHttpAgent
  bpHttpsAgent.destroy()
  bpHttpAgent.destroy()

  maybeSendMetrics(true)
}

;(async () => {
  initGlobalRateLimit()
  try {
    switch (config.testType) {
      case 'load': await runLoadTest(); break
      case 'stress': await runStressTest(); break
      case 'spike': await runSpikeTest(); break
      case 'endurance': await runEnduranceTest(); break
      case 'rate-limit': await runRateLimitTest(); break
      case 'breakpoint': await runBreakpointTest(); break
      default: await runLoadTest()
    }
    parentPort.postMessage({ type: 'done' })
  } catch (err) {
    parentPort.postMessage({ type: 'done', error: err.message })
  }
})()
