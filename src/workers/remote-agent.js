#!/usr/bin/env node

/**
 * API Performance Tester — Remote Load Agent
 *
 * Standalone Node.js process deployable on any machine/container to generate
 * distributed extreme-burst load. Coordinates with the master Orchestrator
 * over a WebSocket control channel.
 *
 * Usage:
 *   node src/workers/remote-agent.js --orchestrator=ws://localhost:4005 --token=brk_YOUR_TOKEN [--name=my-node]
 */

const http = require('http')
const https = require('https')
const { URL } = require('url')
const os = require('os')
const crypto = require('crypto')

// Attempt to load 'ws'
let WebSocket
try {
  WebSocket = require('ws')
} catch {
  try {
    WebSocket = require('../../../node_modules/ws')
  } catch (err) {
    console.error('Error: "ws" package is required. Run "npm install ws" in the project directory.')
    process.exit(1)
  }
}

// ── Parse CLI arguments ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
let orchestratorUrl = 'ws://localhost:4005'
let token = ''
let agentName = `${os.hostname()}-${process.pid}`
let capacityRps = 50000
let capacityVUs = 10000

for (const arg of args) {
  if (arg.startsWith('--orchestrator=')) orchestratorUrl = arg.split('=')[1]
  else if (arg.startsWith('--token=')) token = arg.split('=')[1]
  else if (arg.startsWith('--name=')) agentName = arg.split('=')[1]
  else if (arg.startsWith('--capacity-rps=')) capacityRps = parseInt(arg.split('=')[1], 10) || 50000
  else if (arg.startsWith('--capacity-vus=')) capacityVUs = parseInt(arg.split('=')[1], 10) || 10000
}

if (!token) {
  console.error('\x1b[31mError: --token=<cluster_token> is required.\x1b[0m')
  console.log('Get the cluster token from the testing tool dashboard under "Remote Agents".')
  console.log('Example: node src/workers/remote-agent.js --orchestrator=ws://localhost:4005 --token=brk_123456')
  process.exit(1)
}

const agentId = 'agt_' + crypto.randomBytes(6).toString('hex')

// Uncap socket limits for extreme throughput
http.globalAgent = new http.Agent({ maxSockets: Infinity, keepAlive: false })
https.globalAgent = new https.Agent({ maxSockets: Infinity, keepAlive: false })

console.log(`\x1b[36m[Remote Agent]\x1b[0m Starting ${agentName} (${agentId})`)
console.log(`\x1b[36m[Remote Agent]\x1b[0m Connecting to Orchestrator at: ${orchestratorUrl}`)

let ws = null
let currentRun = null

function connect() {
  ws = new WebSocket(orchestratorUrl)

  ws.on('open', () => {
    console.log(`\x1b[32m[Remote Agent]\x1b[0m Connected! Authenticating with token...`)
    ws.send(JSON.stringify({
      type: 'register',
      agentId,
      name: agentName,
      token,
      capacityRps,
      capacityVUs,
    }))
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())

      if (msg.type === 'registered') {
        console.log(`\x1b[32m[Remote Agent]\x1b[0m Handshake successful! Registered as active cluster node. Waiting for load assignments...`)
      } else if (msg.type === 'register_failed') {
        console.error(`\x1b[31m[Remote Agent]\x1b[0m Registration rejected: ${msg.error}`)
        process.exit(1)
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
      } else if (msg.type === 'assign_load') {
        handleLoadAssignment(msg)
      } else if (msg.type === 'stop') {
        if (currentRun && currentRun.testId === msg.testId) {
          console.log(`\x1b[33m[Remote Agent]\x1b[0m Stop requested for test ${msg.testId}`)
          currentRun.stopped = true
        }
      }
    } catch (err) {
      console.error('[Remote Agent] Error processing message:', err.message)
    }
  })

  ws.on('close', (code, reason) => {
    console.log(`\x1b[33m[Remote Agent]\x1b[0m Connection closed (${code}: ${reason || 'Disconnected'}). Retrying in 3s...`)
    if (currentRun) currentRun.stopped = true
    setTimeout(connect, 3000)
  })

  ws.on('error', (err) => {
    console.error(`\x1b[31m[Remote Agent]\x1b[0m Socket error: ${err.message}`)
  })
}

// ── High Performance Request Execution Loop ──────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function runSingleRequest(urlStr, method, headers, body, timeout) {
  return new Promise((resolve) => {
    const start = performance.now()
    let statusCode = 0
    let responseSize = 0

    let parsedUrl
    try {
      parsedUrl = new URL(urlStr)
    } catch {
      resolve({ timestamp: Date.now(), statusCode: 0, responseTime: 0, responseSize: 0, error: 'Invalid URL', isTimeout: false, isConnectionFailure: true })
      return
    }

    const isHttps = parsedUrl.protocol === 'https:'
    const lib = isHttps ? https : http

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method || 'GET',
      headers: headers || {},
      timeout: timeout || 30000,
    }

    const req = lib.request(options, (res) => {
      statusCode = res.statusCode || 0
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        responseSize = buf.length
        const responseTime = performance.now() - start
        resolve({
          timestamp: Date.now(),
          statusCode,
          responseTime,
          responseSize,
          isTimeout: false,
          isConnectionFailure: false,
        })
      })
      res.on('error', (err) => {
        resolve({
          timestamp: Date.now(),
          statusCode: 0,
          responseTime: performance.now() - start,
          responseSize: 0,
          error: err.message,
          isTimeout: false,
          isConnectionFailure: true,
        })
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({
        timestamp: Date.now(),
        statusCode: 0,
        responseTime: performance.now() - start,
        responseSize: 0,
        error: 'timeout',
        isTimeout: true,
        isConnectionFailure: false,
      })
    })

    req.on('error', (err) => {
      resolve({
        timestamp: Date.now(),
        statusCode: 0,
        responseTime: performance.now() - start,
        responseSize: 0,
        error: err.message,
        isTimeout: false,
        isConnectionFailure: true,
      })
    })

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      req.write(body)
    }
    req.end()
  })
}

async function handleLoadAssignment(assignment) {
  const { testId, config, virtualUsers, targetRps, duration } = assignment
  console.log(`\x1b[32m[Remote Agent]\x1b[0m >>> EXECUTING LOAD: ${virtualUsers} VUs | Target ${targetRps} RPS | ${duration}s burst`)

  const runState = {
    testId,
    stopped: false,
  }
  currentRun = runState

  // Token bucket rate limiter if targetRps is configured
  let tokens = targetRps > 0 ? targetRps : Infinity
  const maxTokens = targetRps > 0 ? targetRps : Infinity
  const refillPerMs = targetRps > 0 ? targetRps / 1000 : Infinity
  let lastRefill = Date.now()

  async function acquireToken() {
    if (maxTokens === Infinity) return
    while (!runState.stopped) {
      const now = Date.now()
      const elapsed = now - lastRefill
      tokens = Math.min(maxTokens, tokens + elapsed * refillPerMs)
      lastRefill = now
      if (tokens >= 1) {
        tokens -= 1
        return
      }
      await sleep(2)
    }
  }

  const pendingResults = []
  const pendingLogs = []
  let lastMetricsSend = Date.now()

  function flushMetrics(force = false) {
    const now = Date.now()
    if (force || now - lastMetricsSend >= 400) {
      if (ws && ws.readyState === WebSocket.OPEN && pendingResults.length > 0) {
        const toSend = pendingResults.splice(0)
        const logs = pendingLogs.splice(0)
        ws.send(JSON.stringify({
          type: 'metrics_batch',
          testId,
          agentId,
          newResults: toSend,
          currentConcurrency: virtualUsers,
          logs,
        }))
      }
      lastMetricsSend = now
    }
  }

  const durationMs = (duration || 5) * 1000
  const startTime = Date.now()
  let totalSent = 0

  async function runSlot() {
    while (!runState.stopped && Date.now() - startTime < durationMs) {
      await acquireToken()
      if (runState.stopped || Date.now() - startTime >= durationMs) break
      totalSent++
      const res = await runSingleRequest(
        config.url,
        config.method,
        config.headers,
        config.body,
        config.timeout
      )
      pendingResults.push(res)
      if (pendingLogs.length < 500) {
        pendingLogs.push({
          ts: res.timestamp,
          s: res.statusCode,
          l: Math.round(res.responseTime),
          e: res.error || null,
          sz: res.responseSize,
        })
      }
      flushMetrics()
    }
  }

  // Fire concurrent worker slots (up to 10,000 for high-spec nodes)
  const slots = Array.from({ length: Math.min(virtualUsers, 10000) }, () => runSlot())
  await Promise.all(slots)

  flushMetrics(true)

  console.log(`\x1b[32m[Remote Agent]\x1b[0m Load assignment completed! Handled ${totalSent} requests.`)

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'done',
      testId,
      agentId,
    }))
  }

  if (currentRun === runState) {
    currentRun = null
  }
}

connect()
