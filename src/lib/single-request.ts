import https from 'https'
import http from 'http'
import { URL } from 'url'
import type { SingleRequestResult, RequestConfig } from './types'
import { buildRequestHeaders, buildQueryString } from './safety'

export async function executeSingleRequest(
  rawUrl: string,
  config: RequestConfig
): Promise<SingleRequestResult> {
  const finalUrl = buildQueryString(rawUrl, config.queryParams || {})
  const headers = buildRequestHeaders(
    config.headers,
    config.auth,
    config.cookies,
    config.contentType,
    config.body
  )

  return new Promise<SingleRequestResult>((resolve) => {
    let url: URL
    try {
      url = new URL(finalUrl)
    } catch {
      resolve({
        success: false,
        statusCode: 0,
        statusText: 'Invalid URL',
        responseBody: '',
        responseHeaders: {},
        responseSize: 0,
        dnsTime: 0,
        tcpTime: 0,
        tlsTime: 0,
        ttfb: 0,
        totalTime: 0,
        redirectCount: 0,
        redirectUrls: [],
        error: `Invalid URL: ${finalUrl}`,
        url: finalUrl,
        method: config.method,
      })
      return
    }

    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http
    const redirectUrls: string[] = []
    let redirectCount = 0
    const maxRedirects = config.followRedirects ? 10 : 0

    const tStart = performance.now()
    let tDnsEnd = 0
    let tTcpEnd = 0
    let tTlsEnd = 0
    let tTtfb = 0

    function makeRequest(currentUrl: URL): void {
      const options: http.RequestOptions = {
        hostname: currentUrl.hostname,
        port: currentUrl.port || (isHttps ? 443 : 80),
        path: currentUrl.pathname + currentUrl.search,
        method: config.method,
        headers,
        timeout: config.timeout || 30000,
      }

      const req = lib.request(options, (res) => {
        tTtfb = performance.now() - tStart

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && config.followRedirects && redirectCount < maxRedirects) {
          const location = res.headers['location']
          if (location) {
            redirectCount++
            redirectUrls.push(location)
            try {
              const nextUrl = new URL(location, currentUrl.toString())
              makeRequest(nextUrl)
            } catch {
              collectResponse(res, currentUrl)
            }
            // Drain the response to free the connection
            res.resume()
            return
          }
        }

        collectResponse(res, currentUrl)
      })

      req.on('socket', (socket) => {
        socket.on('lookup', () => { tDnsEnd = performance.now() - tStart })
        socket.on('connect', () => { tTcpEnd = performance.now() - tStart })
        socket.on('secureConnect', () => { tTlsEnd = performance.now() - tStart })
      })

      req.on('timeout', () => {
        req.destroy()
        const elapsed = performance.now() - tStart
        resolve({
          success: false,
          statusCode: 0,
          statusText: 'Request Timeout',
          responseBody: '',
          responseHeaders: {},
          responseSize: 0,
          dnsTime: tDnsEnd || 0,
          tcpTime: Math.max(0, tTcpEnd - tDnsEnd),
          tlsTime: Math.max(0, tTlsEnd - tTcpEnd),
          ttfb: 0,
          totalTime: elapsed,
          redirectCount,
          redirectUrls,
          error: `Request timed out after ${config.timeout || 30000}ms`,
          url: finalUrl,
          method: config.method,
        })
      })

      req.on('error', (err) => {
        const elapsed = performance.now() - tStart
        resolve({
          success: false,
          statusCode: 0,
          statusText: 'Connection Error',
          responseBody: '',
          responseHeaders: {},
          responseSize: 0,
          dnsTime: tDnsEnd || 0,
          tcpTime: Math.max(0, tTcpEnd - tDnsEnd),
          tlsTime: Math.max(0, tTlsEnd - tTcpEnd),
          ttfb: 0,
          totalTime: elapsed,
          redirectCount,
          redirectUrls,
          error: err.message,
          url: finalUrl,
          method: config.method,
        })
      })

      if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
        req.write(config.body)
      }
      req.end()
    }

    function collectResponse(res: http.IncomingMessage, _currentUrl: URL): void {
      const chunks: Buffer[] = []

      res.on('data', (chunk: Buffer) => chunks.push(chunk))

      res.on('end', () => {
        const totalTime = performance.now() - tStart
        const body = Buffer.concat(chunks)
        const responseBody = body.toString('utf8').slice(0, 1_000_000) // 1MB max

        const responseHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          responseHeaders[k] = Array.isArray(v) ? v.join(', ') : (v ?? '')
        }

        const statusCode = res.statusCode ?? 0
        resolve({
          success: statusCode >= 200 && statusCode < 400,
          statusCode,
          statusText: res.statusMessage ?? '',
          responseBody,
          responseHeaders,
          responseSize: body.byteLength,
          dnsTime: tDnsEnd,
          tcpTime: Math.max(0, tTcpEnd - tDnsEnd),
          tlsTime: Math.max(0, tTlsEnd - tTcpEnd),
          ttfb: tTtfb,
          totalTime,
          redirectCount,
          redirectUrls,
          url: finalUrl,
          method: config.method,
        })
      })

      res.on('error', (err) => {
        const totalTime = performance.now() - tStart
        resolve({
          success: false,
          statusCode: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          responseBody: '',
          responseHeaders: {},
          responseSize: 0,
          dnsTime: tDnsEnd,
          tcpTime: Math.max(0, tTcpEnd - tDnsEnd),
          tlsTime: Math.max(0, tTlsEnd - tTcpEnd),
          ttfb: tTtfb,
          totalTime,
          redirectCount,
          redirectUrls,
          error: err.message,
          url: finalUrl,
          method: config.method,
        })
      })
    }

    makeRequest(url)
  })
}
