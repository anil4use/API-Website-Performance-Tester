import { NextRequest, NextResponse } from 'next/server'
import http from 'http'
import https from 'https'
import { URL } from 'url'
import { getAgentRegistry } from '@/lib/engine/agent-registry'
import { checkUrlSafety } from '@/lib/safety'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { targetUrl, allowLocal } = await req.json()
    if (!targetUrl) {
      return NextResponse.json({ error: 'Target URL is required for calibration' }, { status: 400 })
    }

    const safety = checkUrlSafety(targetUrl, allowLocal ?? false)
    if (!safety.safe) {
      return NextResponse.json({ error: safety.reasons.join(' ') }, { status: 400 })
    }

    let parsed: URL
    try {
      parsed = new URL(targetUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? https : http

    const startTime = Date.now()
    const durationMs = 2000 // 2 second calibration burst
    const endTime = startTime + durationMs
    let completed = 0

    // Use keep-alive agent matching the breakpoint test engine (same connection mode = accurate measurement)
    const poolSize = 200
    const agent = isHttps
      ? new https.Agent({ maxSockets: poolSize, keepAlive: true, keepAliveMsecs: 5000 })
      : new http.Agent({ maxSockets: poolSize, keepAlive: true, keepAliveMsecs: 5000 })

    function singlePing(): Promise<void> {
      return new Promise((resolve) => {
        const r = lib.request({
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'HEAD', // HEAD request for calibration speed
          agent,
          timeout: 2000,
        }, (res) => {
          res.resume()
          completed++
          resolve()
        })
        r.on('error', () => { completed++; resolve() })
        r.on('timeout', () => { r.destroy(); completed++; resolve() })
        r.end()
      })
    }

    // Run 200 concurrent calibration workers (matches pool size for accurate throughput measure)
    async function slot() {
      while (Date.now() < endTime) {
        await singlePing()
      }
    }

    await Promise.all(Array.from({ length: poolSize }, () => slot()))

    const elapsedSec = (Date.now() - startTime) / 1000
    const measuredRps = Math.max(100, Math.round(completed / elapsedSec))

    const registry = getAgentRegistry()
    registry.setCalibratedRps(measuredRps)

    return NextResponse.json({
      measuredRps,
      durationMs: Math.round(elapsedSec * 1000),
      totalRequests: completed,
      calibratedRps: registry.getCalibratedRps(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
