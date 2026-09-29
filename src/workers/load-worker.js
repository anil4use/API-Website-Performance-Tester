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
  const rps = config.bypass?.maxRps
  if (rps && rps > 0) {
    gMaxTokens = rps
    gTokens = rps
    gRefillPerMs = rps / 1000
    gLastRefill = Date.now()
  }
}

async function acquireGlobalToken() {
  if (!config.bypass?.maxRps || config.bypass.maxRps <= 0) return
  while (true) {
    const now = Date.now()
    const elapsed = now - gLastRefill
    gTokens = Math.min(gMaxTokens, gTokens + elapsed * gRefillPerMs)
    gLastRefill = now
    if (gTokens >= 1) {
      gTokens -= 1
      return
    }
    await sleep(20)
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

function maybeSendMetrics(force) {
  const now = Date.now()
  if (force || now - lastMetricsSend >= 500) {
    const toSend = pendingResults.splice(0)
    const logs = pendingLogs.splice(0)
    parentPort.postMessage({
      type: 'metrics',
      data: { newResults: toSend, currentConcurrency, stressLevel: undefined, logs },
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
  const startTime = Date.now()

  currentConcurrency = rampUpMs > 0 ? 1 : concurrency

  // Ramp up
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

  for (const level of levels) {
    if (stopped) break
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

;(async () => {
  initGlobalRateLimit()
  try {
    switch (config.testType) {
      case 'load': await runLoadTest(); break
      case 'stress': await runStressTest(); break
      case 'spike': await runSpikeTest(); break
      case 'endurance': await runEnduranceTest(); break
      case 'rate-limit': await runRateLimitTest(); break
      default: await runLoadTest()
    }
    parentPort.postMessage({ type: 'done' })
  } catch (err) {
    parentPort.postMessage({ type: 'done', error: err.message })
  }
})()
