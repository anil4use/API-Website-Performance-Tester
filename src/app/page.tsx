'use client'

import { useState, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Play, Square, Pause, ChevronDown, ChevronUp, Loader2, Link2, Trash2, RefreshCw } from 'lucide-react'

import TargetSection from '@/components/TargetSection'
import RequestSection from '@/components/RequestSection'
import TestTypeSection from '@/components/TestTypeSection'
import LoadSection from '@/components/LoadSection'
import LiveMetrics from '@/components/LiveMetrics'
import MetricCharts from '@/components/MetricCharts'
import TestReportView from '@/components/TestReportView'
import SingleRequestResultView from '@/components/SingleRequestResult'
import SafetyModal from '@/components/SafetyModal'
import LiveTerminal from '@/components/LiveTerminal'
import BypassSection from '@/components/BypassSection'
import BreakpointSection from '@/components/BreakpointSection'

import type {
  TestType, RequestConfig, LoadConfig, StressConfig, SpikeConfig,
  EnduranceConfig, RateLimitConfig, BreakpointConfig, AggregatedMetrics, TestReport,
  TestConfig, SingleRequestResult, BypassOptions,
} from '@/lib/types'
import { cn } from '@/lib/utils'

// ─── URL State Persistence ────────────────────────────────────────────────────

function encodeState(state: object): string {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(state))
    let bin = ''
    bytes.forEach(b => { bin += String.fromCharCode(b) })
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  } catch { return '' }
}

function decodeState(encoded: string): Record<string, any> | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - encoded.length % 4) % 4)
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch { return null }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defaultRequest: RequestConfig = {
  method: 'GET',
  headers: {},
  queryParams: {},
  body: undefined,
  contentType: 'application/json',
  auth: { type: 'none' },
  cookies: {},
  timeout: 30000,
  followRedirects: true,
}

const defaultLoad: LoadConfig = { concurrency: 10, totalRequests: 1000 }
const defaultStress: StressConfig = { levels: [10, 25, 50, 100, 250, 500], levelDuration: 30, rampBetweenLevels: 5 }
const defaultSpike: SpikeConfig = { normalUsers: 10, spikeUsers: 200, normalDuration: 30, spikeDuration: 30, recoveryDuration: 60 }
const defaultEndurance: EnduranceConfig = { concurrency: 10, duration: 600 }
const defaultRateLimit: RateLimitConfig = { totalRequests: 1000, concurrency: 50, burstMode: false }
const defaultBreakpoint: BreakpointConfig = {
  testType: 'breakpoint',
  targetVirtualUsers: 100000,
  targetRequestsPerSecond: 1000000,
  burstDurationSeconds: 5,
  rampStrategy: 'ramp_1s',
  distributedNodes: 1,
  abortConditions: {
    maxErrorRatePercent: 50,
    maxP99LatencyMs: 30000,
    consecutiveTimeoutLimit: 500,
  },
}
const defaultBypass: BypassOptions = { rotateIp: false, rotateUserAgent: false, bypassHeader: false, bypassHeaderName: 'X-Load-Test-Key', bypassHeaderValue: '', rotateHeaderValue: false, requestDelay: 0, retryOn429: false, retryDelay: 1000, maxRps: 0 }

type AppPhase = 'config' | 'running' | 'complete'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  // Config state
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [testType, setTestType] = useState<TestType>('single')
  const [request, setRequest] = useState<RequestConfig>(defaultRequest)
  const [load, setLoad] = useState<LoadConfig>(defaultLoad)
  const [stress, setStress] = useState<StressConfig>(defaultStress)
  const [spike, setSpike] = useState<SpikeConfig>(defaultSpike)
  const [endurance, setEndurance] = useState<EnduranceConfig>(defaultEndurance)
  const [rateLimit, setRateLimit] = useState<RateLimitConfig>(defaultRateLimit)
  const [breakpoint, setBreakpoint] = useState<BreakpointConfig>(defaultBreakpoint)
  const [bypass, setBypass] = useState<BypassOptions>(defaultBypass)
  const [allowLocal, setAllowLocal] = useState(false)

  // App state
  const [phase, setPhase] = useState<AppPhase>('config')
  const [testId, setTestId] = useState<string | null>(null)
  const [pendingConfig, setPendingConfig] = useState<TestConfig | null>(null)
  const [status, setStatus] = useState<string>('idle')
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null)
  const [report, setReport] = useState<TestReport | null>(null)
  const [singleResult, setSingleResult] = useState<SingleRequestResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [showSafetyModal, setShowSafetyModal] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSingleLoading, setIsSingleLoading] = useState(false)
  const [terminalLogs, setTerminalLogs] = useState<Array<{ ts: number; s: number; l: number; e: string | null }>>([])
  const [showTerminal, setShowTerminal] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)

  const eventSourceRef = useRef<EventSource | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const urlSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    }
  }, [])

  // ── Read state from URL on mount ────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cfg = params.get('cfg')
    if (!cfg) return
    const s = decodeState(cfg)
    if (!s || s.v !== 1) return
    if (s.url) setUrl(s.url)
    if (s.name) setName(s.name)
    if (s.testType) setTestType(s.testType)
    if (s.request) setRequest(s.request)
    if (s.load) setLoad(s.load)
    if (s.stress) setStress(s.stress)
    if (s.spike) setSpike(s.spike)
    if (s.endurance) setEndurance(s.endurance)
    if (s.rateLimit) setRateLimit(s.rateLimit)
    if (s.breakpoint) setBreakpoint(s.breakpoint)
    if (s.bypass) setBypass(s.bypass)
    if (s.allowLocal !== undefined) setAllowLocal(s.allowLocal)
  }, [])

  // ── Sync state to URL (debounced 600ms) ────────────────────────────────────
  useEffect(() => {
    if (urlSyncTimer.current) clearTimeout(urlSyncTimer.current)
    urlSyncTimer.current = setTimeout(() => {
      const encoded = encodeState({ v: 1, url, name, testType, request, load, stress, spike, endurance, rateLimit, breakpoint, bypass, allowLocal })
      if (encoded) window.history.replaceState(null, '', `?cfg=${encoded}`)
    }, 600)
    return () => { if (urlSyncTimer.current) clearTimeout(urlSyncTimer.current) }
  }, [url, name, testType, request, load, stress, spike, endurance, rateLimit, breakpoint, allowLocal])

  // ─── Build config ────────────────────────────────────────────────────────────

  function buildConfig(id: string): TestConfig {
    return {
      id,
      name: name || `${testType} — ${new URL(url).hostname}`,
      type: testType,
      target: url,
      request,
      load: testType === 'load' ? load : undefined,
      stress: testType === 'stress' ? stress : undefined,
      spike: testType === 'spike' ? spike : undefined,
      endurance: testType === 'endurance' ? endurance : undefined,
      rateLimit: testType === 'rate-limit' ? rateLimit : undefined,
      breakpoint: testType === 'breakpoint' ? breakpoint : undefined,
      bypass: (bypass.rotateIp || bypass.rotateUserAgent || bypass.bypassHeader || bypass.retryOn429 || bypass.requestDelay > 0 || bypass.maxRps > 0) ? bypass : undefined,
      authorizedByUser: true,
    }
  }

  function estimatedRequests(): number {
    if (testType === 'load') return load.totalRequests ?? 0
    if (testType === 'stress') return stress.levels.reduce((a, b) => a + b, 0) * stress.levelDuration
    if (testType === 'spike') return spike.normalUsers * spike.normalDuration + spike.spikeUsers * spike.spikeDuration + spike.normalUsers * spike.recoveryDuration
    if (testType === 'endurance') return endurance.concurrency * endurance.duration
    if (testType === 'rate-limit') return rateLimit.totalRequests
    if (testType === 'breakpoint') return breakpoint.targetRequestsPerSecond * breakpoint.burstDurationSeconds
    return 0
  }

  // ─── Single request ──────────────────────────────────────────────────────────

  async function runSingleRequest() {
    if (!url) { setError('Enter a target URL first.'); return }
    setError(null)
    setIsSingleLoading(true)
    setSingleResult(null)
    setPhase('running')

    try {
      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, config: request, allowLocal }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setPhase('config'); return }
      setSingleResult(data)
      setPhase('complete')
    } catch (err: any) {
      setError(err.message)
      setPhase('config')
    } finally {
      setIsSingleLoading(false)
    }
  }

  // ─── Prepare and confirm load test ──────────────────────────────────────────

  function handleRunClick() {
    if (!url) { setError('Enter a target URL first.'); return }
    if (testType === 'single') { runSingleRequest(); return }

    let parsed: URL
    try { parsed = new URL(url) } catch { setError('Invalid URL format.'); return }

    setError(null)
    const id = uuidv4()
    const config = buildConfig(id)
    setTestId(id)
    setPendingConfig(config)
    setShowSafetyModal(true)
  }

  async function startLoadTest() {
    setShowSafetyModal(false)
    if (!pendingConfig || !testId) return
    const config = pendingConfig

    setPhase('running')
    setMetrics(null)
    setReport(null)
    setStatus('running')
    setElapsed(0)
    startTimeRef.current = Date.now()

    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current)
    }, 200)

    try {
      const res = await fetch(`/api/tests/${testId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error)
        setPhase('config')
        clearInterval(elapsedTimerRef.current!)
        return
      }
    } catch (err: any) {
      setError(err.message)
      setPhase('config')
      clearInterval(elapsedTimerRef.current!)
      return
    }

    // SSE stream for real-time metrics
    const es = new EventSource(`/api/tests/${testId}/stream`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'metrics') {
          setMetrics(msg.data)
          setStatus(msg.status)
          if (msg.logs?.length) {
            setTerminalLogs(prev => {
              const next = [...prev, ...msg.logs]
              return next.length > 5000 ? next.slice(-5000) : next
            })
          }
        } else if (msg.type === 'status') {
          setStatus(msg.status)
          if (msg.logs?.length) {
            setTerminalLogs(prev => {
              const next = [...prev, ...msg.logs]
              return next.length > 5000 ? next.slice(-5000) : next
            })
          }
        } else if (msg.type === 'report') {
          setReport(msg.data)
          setPhase('complete')
          setStatus('completed')
          if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
          es.close()
        } else if (msg.type === 'error') {
          setError(msg.message)
          setPhase('config')
          if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
          es.close()
        }
      } catch { /* parse error ignored */ }
    }

    es.onerror = () => {
      setTimeout(async () => {
        if (!report) {
          try {
            const res = await fetch(`/api/tests/${testId}/report`)
            if (res.ok) { setReport(await res.json()); setPhase('complete') }
          } catch { /* ignore */ }
        }
        setStatus(prev => prev === 'running' ? 'completed' : prev)
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      }, 800)
      es.close()
    }
  }

  async function stopTest() {
    if (!testId) return
    await fetch(`/api/tests/${testId}/stop`, { method: 'POST' })
    setStatus('stopping')
    eventSourceRef.current?.close()
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
  }

  async function pauseTest() {
    if (!testId) return
    await fetch(`/api/tests/${testId}/control`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    })
    setStatus('paused')
  }

  async function resumeTest() {
    if (!testId) return
    await fetch(`/api/tests/${testId}/control`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' }),
    })
    setStatus('running')
  }

  function reset() {
    eventSourceRef.current?.close()
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    setPhase('config')
    setMetrics(null)
    setReport(null)
    setSingleResult(null)
    setStatus('idle')
    setError(null)
    setElapsed(0)
    setTestId(null)
    setPendingConfig(null)
    setTerminalLogs([])
  }

  // Keep config, reset results only — for Retest
  function retest() {
    eventSourceRef.current?.close()
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    setPhase('config')
    setMetrics(null)
    setReport(null)
    setSingleResult(null)
    setStatus('idle')
    setError(null)
    setElapsed(0)
    setTestId(null)
    setPendingConfig(null)
    setTerminalLogs([])
  }

  // Reset config + results + clear URL params
  function clearAll() {
    eventSourceRef.current?.close()
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    setUrl('')
    setName('')
    setTestType('single')
    setRequest(defaultRequest)
    setLoad(defaultLoad)
    setStress(defaultStress)
    setSpike(defaultSpike)
    setEndurance(defaultEndurance)
    setRateLimit(defaultRateLimit)
    setBreakpoint(defaultBreakpoint)
    setBypass(defaultBypass)
    setAllowLocal(false)
    setPhase('config')
    setMetrics(null)
    setReport(null)
    setSingleResult(null)
    setStatus('idle')
    setError(null)
    setElapsed(0)
    setTestId(null)
    setPendingConfig(null)
    setTerminalLogs([])
    window.history.replaceState(null, '', window.location.pathname)
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function exportReport(fmt: 'json' | 'csv' | 'html') {
    if (!testId) return
    window.open(`/api/tests/${testId}/export?format=${fmt}`, '_blank')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isRunning = phase === 'running'
  const isComplete = phase === 'complete'
  const configDisabled = isRunning

  return (
    <div className="min-h-screen bg-[#08111f]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[#08111f]/95 backdrop-blur border-b border-[#1a3352]">
        <div className="w-[92%] max-w-none mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="white" strokeWidth="1.5" />
                <path d="M4 7h6M7 4v6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">API &amp; Website Performance Tester</h1>
              <p className="text-[10px] text-slate-600">Generic local testing tool — test any authorized target</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isRunning && (
              <div className="flex items-center gap-1.5">
                <span className="live-dot w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span className="text-xs text-emerald-400 font-medium">LIVE</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="w-[92%] max-w-none mx-auto px-4 py-5 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300 flex items-start gap-3">
            <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 text-lg leading-none">×</button>
          </div>
        )}

        {/* ── Config sections ────────────────────────────────────────────────── */}
        <div className={cn('space-y-5', configDisabled && 'opacity-50 pointer-events-none select-none')}>
          <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-2xl p-6">
            <TargetSection url={url} name={name} onUrlChange={setUrl} onNameChange={setName} />
          </div>

          <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-2xl p-6">
            <RequestSection config={request} onChange={setRequest} />
          </div>

          <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-2xl p-6">
            <TestTypeSection selected={testType} onChange={(t) => { setTestType(t); reset() }} />
          </div>

          {testType !== 'single' && testType !== 'breakpoint' && (
            <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-2xl p-6">
              <LoadSection
                testType={testType}
                load={load} onLoad={setLoad}
                stress={stress} onStress={setStress}
                spike={spike} onSpike={setSpike}
                endurance={endurance} onEndurance={setEndurance}
                rateLimit={rateLimit} onRateLimit={setRateLimit}
              />
            </div>
          )}

          {testType === 'breakpoint' && (
            <div className="bg-[#0d1b2e] border border-rose-900/30 rounded-2xl p-6">
              <BreakpointSection
                config={breakpoint}
                targetUrl={url}
                allowLocal={allowLocal}
                onChange={setBreakpoint}
              />
            </div>
          )}

          {/* Rate Limit Bypass — shown for all test types */}
          <div className="bg-[#0d1b2e] border border-orange-900/30 rounded-2xl p-6">
            <BypassSection bypass={bypass} onChange={setBypass} />
          </div>

          {/* Advanced */}
          <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-[#111f35] transition-colors"
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Advanced Options</span>
              {showAdvanced ? <ChevronUp size={13} className="text-slate-600" /> : <ChevronDown size={13} className="text-slate-600" />}
            </button>
            {showAdvanced && (
              <div className="px-6 pb-5 border-t border-[#1a3352] pt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowLocal}
                    onChange={(e) => setAllowLocal(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500 mt-0.5"
                  />
                  <div>
                    <p className="text-sm text-slate-300">Allow Local / Internal Testing</p>
                    <p className="text-xs text-slate-600 mt-0.5">Enable to test localhost, 127.x.x.x, 192.168.x.x, 10.x.x.x, and other private network addresses. Not needed for public URLs.</p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* ── Action buttons ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 py-1 flex-wrap">
          {!isRunning && !isComplete && (
            <>
              <button
                onClick={handleRunClick}
                disabled={!url || isSingleLoading}
                className="flex items-center gap-2 px-7 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/30"
              >
                {isSingleLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {isSingleLoading ? 'Running…' : testType === 'single' ? 'Send Request' : 'Run Test'}
              </button>
              {url && (
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[#1a3352] text-xs text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-all"
                >
                  <Link2 size={13} />
                  {linkCopied ? 'Copied!' : 'Copy Link'}
                </button>
              )}
              {url && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[#1a3352] text-xs text-slate-500 hover:border-red-700 hover:text-red-400 transition-all"
                >
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </>
          )}

          {isRunning && (
            <>
              {status === 'paused' ? (
                <button onClick={resumeTest} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-all">
                  <Play size={15} /> Resume
                </button>
              ) : (
                <button onClick={pauseTest} className="flex items-center gap-2 px-5 py-2.5 bg-[#162744] border border-[#1a3352] hover:bg-[#1a2d45] text-slate-300 text-sm font-semibold rounded-xl transition-all">
                  <Pause size={15} /> Pause
                </button>
              )}
              <button onClick={stopTest} className="flex items-center gap-2 px-5 py-2.5 bg-red-950/60 border border-red-900/50 hover:bg-red-950 text-red-300 text-sm font-semibold rounded-xl transition-all">
                <Square size={15} /> Stop Test
              </button>
            </>
          )}

          {isComplete && (
            <>
              <button onClick={retest} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all">
                <RefreshCw size={15} /> Retest
              </button>
              <button onClick={clearAll} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#1a3352] text-sm text-slate-400 hover:border-red-700 hover:text-red-400 transition-all">
                <Trash2 size={15} /> Clear
              </button>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1a3352] text-xs text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-all"
              >
                <Link2 size={13} />
                {linkCopied ? 'Copied!' : 'Copy Link'}
              </button>
              {testId && (
                <div className="flex gap-2 ml-2">
                  <span className="text-xs text-slate-600 self-center">Export:</span>
                  {(['json', 'csv', 'html'] as const).map(fmt => (
                    <button key={fmt} onClick={() => exportReport(fmt)}
                      className="px-3 py-2 text-xs rounded-lg border border-[#1a3352] text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-all uppercase font-mono">
                      {fmt}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 429 auto-detect banner ────────────────────────────────────────── */}
        {isRunning && metrics && metrics.status429 > 0 && !bypass.rotateIp && !bypass.rotateUserAgent && !bypass.bypassHeader && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-950/40 border border-orange-700/40 text-sm">
            <span className="text-xl shrink-0">⚡</span>
            <div className="flex-1 min-w-0">
              <span className="text-orange-300 font-medium">Rate limiting detected — {metrics.status429.toLocaleString()} requests blocked (429)</span>
              <span className="text-orange-500/70 ml-2 text-xs">Enable bypass below to let test traffic through</span>
            </div>
            <button
              onClick={() => { setBypass(b => ({ ...b, rotateIp: true })) }}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-600 text-white text-xs font-semibold transition-colors"
            >
              Enable IP Rotation
            </button>
          </div>
        )}

        {/* ── Live view: Terminal 50% | Stats 50% ──────────────────────────── */}
        {isRunning && (
          <div className="flex gap-4" style={{ height: 'calc(100vh - 200px)', minHeight: '580px' }}>
            {/* Left 50%: Terminal */}
            <div className="flex-1 min-w-0">
              <LiveTerminal logs={terminalLogs} method={request.method} />
            </div>

            {/* Right 50%: Metrics + Charts scrollable */}
            <div className="w-[50%] min-w-0 flex flex-col gap-3 overflow-y-auto">
              {metrics ? (
                <>
                  <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4 shrink-0">
                    <LiveMetrics metrics={metrics} status={status} elapsed={elapsed} />
                  </div>
                  {metrics.timeSeries.length >= 3 && (
                    <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4 shrink-0">
                      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-3">Real-time Charts</h2>
                      <MetricCharts timeSeries={metrics.timeSeries} />
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4 flex-1 flex items-center justify-center">
                  <span className="text-slate-600 text-sm">Waiting for first results…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Single request result ─────────────────────────────────────────── */}
        {isComplete && testType === 'single' && singleResult && (
          <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-2xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Result</h2>
            <SingleRequestResultView result={singleResult} />
          </div>
        )}

        {/* ── Final test report: Terminal 50% | Report 50% ─────────────────── */}
        {isComplete && testType !== 'single' && report && (
          <div className="flex gap-4" style={{ minHeight: '520px' }}>
            {terminalLogs.length > 0 && (
              <div className="flex-1 min-w-0" style={{ height: 'calc(100vh - 200px)', minHeight: '520px' }}>
                <LiveTerminal logs={terminalLogs} method={request.method} />
              </div>
            )}
            <div className={`min-w-0 overflow-y-auto ${terminalLogs.length > 0 ? 'w-[50%]' : 'w-full'}`}>
              <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-5">
                <TestReportView report={report} onExport={exportReport} />
              </div>
            </div>
          </div>
        )}

        {/* Fallback: show metrics if report not yet loaded */}
        {isComplete && testType !== 'single' && !report && metrics && (
          <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Test Completed — Metrics</h2>
            <LiveMetrics metrics={metrics} status={status} elapsed={elapsed} />
            {metrics.timeSeries.length >= 2 && (
              <div className="mt-5">
                <MetricCharts timeSeries={metrics.timeSeries} />
              </div>
            )}
          </div>
        )}

        <div className="pb-12" />
      </main>

      {/* Modals */}
      {showSafetyModal && pendingConfig && (
        <SafetyModal
          config={pendingConfig}
          estimatedRequests={estimatedRequests()}
          onConfirm={startLoadTest}
          onCancel={() => { setShowSafetyModal(false); setPendingConfig(null); setTestId(null) }}
        />
      )}
    </div>
  )
}
