'use client'

import { useState, useEffect } from 'react'
import {
  Flame, Server, AlertTriangle, ShieldAlert, Cpu, Zap, Copy, Check,
  RefreshCw, Play, Info, ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp, Terminal
} from 'lucide-react'
import type { BreakpointConfig, BreakpointRampStrategy, ClusterStatus } from '@/lib/types'
import { fmtNumber, cn } from '@/lib/utils'

export interface BreakpointPreset {
  name: string
  simulates: string
  vus: number
  targetRps: number
  duration: number
  ramp: BreakpointRampStrategy
  color: string
}

export const BREAKPOINT_PRESETS: BreakpointPreset[] = [
  {
    name: 'Flash Sale Spike',
    simulates: 'E-commerce drop / flash sale',
    vus: 50000,
    targetRps: 200000,
    duration: 10,
    ramp: 'instant',
    color: 'from-amber-500/20 to-orange-500/20 border-orange-500/30 text-orange-400',
  },
  {
    name: 'Viral Social Post',
    simulates: 'App linked from a viral post/tweet',
    vus: 100000,
    targetRps: 1000000,
    duration: 5,
    ramp: 'ramp_1s',
    color: 'from-blue-500/20 to-indigo-500/20 border-indigo-500/30 text-indigo-400',
  },
  {
    name: 'DDoS-style Burst',
    simulates: 'Worst-case malicious/bot burst',
    vus: 200000,
    targetRps: 2000000,
    duration: 3,
    ramp: 'instant',
    color: 'from-rose-500/20 to-red-500/20 border-rose-500/30 text-rose-400',
  },
  {
    name: 'Marketing Email Blast',
    simulates: 'Scheduled blast, clicks in first min',
    vus: 200000,
    targetRps: 50000,
    duration: 60,
    ramp: 'ramp_1s',
    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400',
  },
  {
    name: 'Breaking News Mention',
    simulates: 'Sudden organic traffic surge',
    vus: 30000,
    targetRps: 100000,
    duration: 30,
    ramp: 'ramp_100ms',
    color: 'from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-400',
  },
  {
    name: 'Gradual Capacity Discovery',
    simulates: 'Find system ceiling step-by-step',
    vus: 100000,
    targetRps: 100000,
    duration: 30,
    ramp: 'ramp_1s',
    color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30 text-cyan-400',
  },
]

interface Props {
  config: BreakpointConfig
  targetUrl: string
  allowLocal: boolean
  onChange: (c: BreakpointConfig) => void
}

export default function BreakpointSection({ config, targetUrl, allowLocal, onChange }: Props) {
  const [cluster, setCluster] = useState<ClusterStatus | null>(null)
  const [loadingCluster, setLoadingCluster] = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [calibrationMsg, setCalibrationMsg] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [cmdCopied, setCmdCopied] = useState(false)
  const [showAgents, setShowAgents] = useState(false)

  // Fetch cluster status
  async function fetchCluster() {
    setLoadingCluster(true)
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const data = await res.json()
        setCluster(data)
      }
    } catch { /* ignore */ }
    setLoadingCluster(false)
  }

  useEffect(() => {
    fetchCluster()
    const timer = setInterval(fetchCluster, 5000)
    return () => clearInterval(timer)
  }, [])

  // Run 2s Calibration Burst
  async function runCalibration() {
    if (!targetUrl) {
      setCalibrationMsg('Enter a target URL above first to calibrate.')
      return
    }
    setIsCalibrating(true)
    setCalibrationMsg(null)
    try {
      const res = await fetch('/api/agents/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, allowLocal }),
      })
      const data = await res.json()
      if (res.ok) {
        setCalibrationMsg(`Measured single-node limit: ${data.measuredRps.toLocaleString()} RPS (${data.totalRequests.toLocaleString()} requests in ${data.durationMs}ms)`)
        fetchCluster()
      } else {
        setCalibrationMsg(`Calibration failed: ${data.error}`)
      }
    } catch (err: any) {
      setCalibrationMsg(`Calibration error: ${err.message}`)
    } finally {
      setIsCalibrating(false)
    }
  }

  // Pre-flight calculations
  const singleNodeCapacity = cluster?.singleNodeEstimatedRps || 3000
  const activeAgentsCount = cluster?.connectedAgents?.filter(a => a.status === 'idle').length || 0
  const totalNodesAvailable = 1 + activeAgentsCount
  const requestedNodes = Math.max(1, config.distributedNodes || 1)
  const actualNodesToUse = Math.min(requestedNodes, totalNodesAvailable)
  const clusterMaxRps = actualNodesToUse * singleNodeCapacity
  const isOverCapacity = config.targetRequestsPerSecond > clusterMaxRps

  // Detect whether target is local, LAN, or external HTTPS — affects realistic achievable RPS
  function categorizeTarget(url: string): 'local' | 'lan' | 'external' {
    try {
      const u = new URL(url)
      const h = u.hostname
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return 'local'
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h)) return 'lan'
      return 'external'
    } catch { return 'external' }
  }
  const targetCategory = categorizeTarget(targetUrl || '')
  const categoryMaxRps = targetCategory === 'local' ? 30000 : targetCategory === 'lan' ? 8000 : 3000
  const singleMachineRealistic = categoryMaxRps
  const configuredFarExceedsActual = config.targetRequestsPerSecond > singleMachineRealistic * actualNodesToUse * 3

  function applyPreset(p: BreakpointPreset) {
    onChange({
      ...config,
      targetVirtualUsers: p.vus,
      targetRequestsPerSecond: p.targetRps,
      burstDurationSeconds: p.duration,
      rampStrategy: p.ramp,
    })
  }

  function capAtAchievable() {
    onChange({
      ...config,
      targetRequestsPerSecond: clusterMaxRps,
    })
  }

  const agentCommand = `node src/workers/remote-agent.js --orchestrator=ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:4005 --token=${cluster?.token || 'YOUR_TOKEN'}`

  function copyText(txt: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-400">
            <Flame size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Breakpoint / Extreme Burst Configuration
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-900/40 border border-rose-800/40 text-rose-400 font-mono">
                EXTREME LOAD
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Deliberately test system limits and failure modes under massive realistic burst traffic.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAgents(!showAgents)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all',
            activeAgentsCount > 0
              ? 'border-emerald-600/50 bg-emerald-950/30 text-emerald-400'
              : 'border-[#1a3352] text-slate-400 hover:border-blue-500 hover:text-blue-300'
          )}
        >
          <Server size={13} />
          <span>Cluster: {totalNodesAvailable} Node{totalNodesAvailable > 1 ? 's' : ''}</span>
          <span className="text-[10px] font-mono opacity-80">({fmtNumber(clusterMaxRps)} RPS)</span>
          {showAgents ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* ── Scenario Presets ──────────────────────────────────────────────── */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5 block">
          Realistic Scenario Presets (One-Click)
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {BREAKPOINT_PRESETS.map((p) => {
            const isActive =
              config.targetVirtualUsers === p.vus &&
              config.targetRequestsPerSecond === p.targetRps &&
              config.burstDurationSeconds === p.duration &&
              config.rampStrategy === p.ramp

            return (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  'flex flex-col text-left p-3 rounded-xl border transition-all relative overflow-hidden',
                  isActive
                    ? 'border-rose-500 bg-rose-950/30 shadow-[0_0_15px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/50'
                    : 'border-[#1a3352] bg-[#111f35] hover:border-slate-600 hover:bg-[#14233c]'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn('text-xs font-semibold leading-tight', isActive ? 'text-rose-300' : 'text-slate-200')}>
                    {p.name}
                  </span>
                  {isActive && <CheckCircle2 size={12} className="text-rose-400 shrink-0" />}
                </div>
                <span className="text-[10px] text-slate-500 line-clamp-1 mb-2">
                  {p.simulates}
                </span>
                <div className="mt-auto space-y-0.5 font-mono text-[11px]">
                  <div className="text-slate-300 font-medium">{fmtNumber(p.vus)} VUs</div>
                  <div className="text-rose-400">{fmtNumber(p.targetRps)} RPS</div>
                  <div className="text-slate-500 text-[10px]">{p.duration}s &middot; {p.ramp}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Pre-flight Capacity & Honesty Checker ──────────────────────────── */}
      <div className={cn(
        'rounded-xl p-4 border transition-all space-y-3',
        isOverCapacity
          ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
          : 'bg-blue-950/20 border-blue-900/30 text-slate-300'
      )}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Cpu size={18} className={isOverCapacity ? 'text-amber-400 mt-0.5' : 'text-blue-400 mt-0.5'} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-wide uppercase">
                  Pre-flight Capacity Check
                </span>
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded font-mono',
                  isOverCapacity ? 'bg-amber-900/40 text-amber-300 border border-amber-800/50' : 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/50'
                )}>
                  {isOverCapacity ? 'POTENTIAL BOTTLENECK' : 'ACHIEVABLE'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Single-node capacity baseline: <strong className="text-slate-200">{fmtNumber(singleNodeCapacity)} RPS</strong>.
                Cluster with {actualNodesToUse} active node{actualNodesToUse > 1 ? 's' : ''} can deliver up to{' '}
                <strong className="text-slate-200">{fmtNumber(clusterMaxRps)} RPS</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={runCalibration}
              disabled={isCalibrating || !targetUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#162744] hover:bg-[#1f375f] disabled:opacity-50 border border-[#1a3352] text-slate-200 rounded-lg transition-colors font-medium"
            >
              {isCalibrating ? <RefreshCw size={12} className="animate-spin text-blue-400" /> : <Zap size={12} className="text-yellow-400" />}
              {isCalibrating ? 'Calibrating (2s)…' : 'Calibrate Machine'}
            </button>
          </div>
        </div>

        {calibrationMsg && (
          <div className="text-xs bg-[#091322] border border-[#1a3352] rounded-lg px-3 py-2 font-mono text-cyan-300">
            {calibrationMsg}
          </div>
        )}

        {isOverCapacity && (
          <div className="flex items-center justify-between pt-2 border-t border-amber-800/30 gap-3">
            <p className="text-xs text-amber-300/90 leading-tight">
              ⚠️ Target of <strong>{fmtNumber(config.targetRequestsPerSecond)} RPS</strong> exceeds current cluster capacity ({fmtNumber(clusterMaxRps)} RPS).
              A single local machine cannot deliver this load alone due to OS socket/NIC limits.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={capAtAchievable}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-black text-xs font-semibold rounded-lg transition-colors"
              >
                Cap at {fmtNumber(clusterMaxRps)} RPS
              </button>
            </div>
          </div>
        )}

        {/* Reality Check Banner — shown when configured RPS is far beyond physical limits */}
        {configuredFarExceedsActual && (
          <div className="mt-3 pt-3 border-t border-red-800/30">
            <div className="flex items-start gap-3 rounded-xl bg-red-950/30 border border-red-800/40 p-3">
              <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1.5">
                <p className="font-semibold text-red-300">Why you&apos;re seeing 2k–4k RPS instead of {fmtNumber(config.targetRequestsPerSecond)}</p>
                <p className="text-slate-400 leading-relaxed">
                  This is <strong className="text-slate-200">not a bug</strong> — it&apos;s <strong className="text-slate-200">physics</strong>.
                  A single Node.js process hitting an{' '}
                  <strong className="text-slate-200">
                    {targetCategory === 'external' ? 'external HTTPS website' : targetCategory === 'lan' ? 'LAN server' : 'local server'}
                  </strong>
                  {' '}is capped at roughly{' '}
                  <strong className="text-rose-300">{fmtNumber(singleMachineRealistic)} RPS</strong>
                  {' '}by:
                </p>
                <ul className="text-slate-500 space-y-0.5 pl-3">
                  {targetCategory === 'external' && (
                    <>
                      <li>• <strong className="text-slate-400">Network RTT</strong>: 50–300ms round-trip to the server limits each connection to 3–20 req/s</li>
                      <li>• <strong className="text-slate-400">CDN / WAF throttling</strong>: cars24.com uses Cloudflare which auto-rate-limits single-IP floods</li>
                      <li>• <strong className="text-slate-400">TLS handshake overhead</strong>: each new HTTPS connection adds 50–150ms</li>
                    </>
                  )}
                  <li>• <strong className="text-slate-400">OS socket limits</strong>: Windows/Linux cap a single process at ~10k–50k simultaneous sockets</li>
                  <li>• <strong className="text-slate-400">Node.js event loop</strong>: a single thread can dispatch ~50k–100k I/O ops/s, not millions</li>
                </ul>
                <p className="text-slate-400 leading-relaxed">
                  To truly reach <strong className="text-slate-200">{fmtNumber(config.targetRequestsPerSecond)} RPS</strong>, you need{' '}
                  <strong className="text-rose-300">
                    {Math.ceil(config.targetRequestsPerSecond / singleMachineRealistic)} machines
                  </strong>{' '}
                  running remote agent workers. Connect them via the Cluster panel above, then set Distributed Nodes accordingly.
                </p>
                <p className="text-emerald-400/80 text-[10px] font-mono">
                  💡 Tip: Click &quot;Calibrate Machine&quot; to measure your actual throughput for this specific target URL.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Remote Agents Control Drawer ───────────────────────────────────── */}
      {showAgents && (
        <div className="bg-[#0b1626] border border-[#1a3352] rounded-xl p-5 space-y-4 fade-in">
          <div className="flex items-center justify-between border-b border-[#1a3352] pb-3">
            <div className="flex items-center gap-2">
              <Server size={16} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-200">Distributed Load Generator Fleet</h3>
            </div>
            <span className="text-xs text-slate-500">
              Control WebSocket: <code className="text-blue-400">ws://localhost:4005</code>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cluster Token */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Cluster Security Token</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={cluster?.token || 'Loading…'}
                  className="flex-1 bg-[#060c17] border border-[#1a3352] rounded-lg px-3 py-2 text-xs font-mono text-slate-300"
                />
                <button
                  type="button"
                  onClick={() => cluster?.token && copyText(cluster.token, setTokenCopied)}
                  className="px-3 py-2 rounded-lg border border-[#1a3352] text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600"
                >
                  {tokenCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">Required by remote agents to authenticate. Anonymous connections are rejected.</p>
            </div>

            {/* Launch Command */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Deploy Remote Worker on Another Machine</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={agentCommand}
                  className="flex-1 bg-[#060c17] border border-[#1a3352] rounded-lg px-3 py-2 text-xs font-mono text-slate-300 truncate"
                />
                <button
                  type="button"
                  onClick={() => copyText(agentCommand, setCmdCopied)}
                  className="px-3 py-2 rounded-lg border border-[#1a3352] text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600"
                >
                  {cmdCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">Run in terminal on any machine with Node.js installed to expand cluster capacity.</p>
            </div>
          </div>

          {/* Connected agents list */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-medium">Connected Agents ({cluster?.totalAgents || 0})</h4>
            {cluster?.connectedAgents && cluster.connectedAgents.length > 0 ? (
              <div className="divide-y divide-[#1a3352] border border-[#1a3352] rounded-lg overflow-hidden bg-[#070e1a]">
                {cluster.connectedAgents.map((ag) => (
                  <div key={ag.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className={cn('w-2 h-2 rounded-full', ag.status === 'idle' ? 'bg-emerald-400' : 'bg-yellow-400')} />
                      <div>
                        <span className="font-medium text-slate-200">{ag.name}</span>
                        <span className="text-slate-500 font-mono ml-2">({ag.host})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 font-mono text-slate-400">
                      <span>Status: <strong className={ag.status === 'idle' ? 'text-emerald-400' : 'text-yellow-400'}>{ag.status.toUpperCase()}</strong></span>
                      <span>Cap: {fmtNumber(ag.capacityRps)} RPS</span>
                      <span>Handled: {fmtNumber(ag.totalRequestsHandled)} reqs</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 border border-dashed border-[#1a3352] rounded-lg p-4 text-center">
                No remote agents currently connected. All load will be generated locally by the primary worker process.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Detailed Parameters ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Target Virtual Users */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 flex items-center justify-between">
            <span>Target Virtual Users (VUs)</span>
            <span className="text-slate-500 font-mono text-[11px]">{fmtNumber(config.targetVirtualUsers)} users</span>
          </label>
          <input
            type="number"
            min={1}
            max={500000}
            step={1000}
            value={config.targetVirtualUsers}
            onChange={(e) => onChange({ ...config, targetVirtualUsers: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-full bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:border-rose-500"
          />
          <p className="text-[10px] text-slate-500">
            Configured target. Actual concurrent connections capped at{' '}
            <strong className="text-slate-400">{fmtNumber(Math.min(config.targetVirtualUsers, 5000))} (pool limit)</strong>{' '}
            — the achieved VUs in results will reflect this real number.
          </p>
        </div>

        {/* Target Requests Per Second */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 flex items-center justify-between">
            <span>Target Requests / Sec (RPS)</span>
            <span className="text-rose-400 font-mono text-[11px]">{fmtNumber(config.targetRequestsPerSecond)} req/s</span>
          </label>
          <input
            type="number"
            min={1}
            max={5000000}
            step={10000}
            value={config.targetRequestsPerSecond}
            onChange={(e) => onChange({ ...config, targetRequestsPerSecond: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-full bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:border-rose-500"
          />
          <p className="text-[10px] text-slate-500">Uncapped maximum burst rate requested across all nodes.</p>
        </div>

        {/* Burst Duration */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 flex items-center justify-between">
            <span>Burst Duration</span>
            <span className={`font-mono text-[11px] ${config.burstDurationSeconds > 300 ? 'text-rose-400' : 'text-slate-500'}`}>
              {config.burstDurationSeconds} seconds
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={300}
              value={config.burstDurationSeconds}
              onChange={(e) => {
                const v = Math.max(1, Math.min(300, parseInt(e.target.value) || 1))
                onChange({ ...config, burstDurationSeconds: v })
              }}
              className={`flex-1 bg-[#111f35] border rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:border-rose-500 ${
                config.burstDurationSeconds > 300 ? 'border-rose-500' : 'border-[#1a3352]'
              }`}
            />
            <span className="text-xs text-slate-500">sec</span>
          </div>
          <p className="text-[10px] text-slate-500">High-intensity burst window. Capped at 300s max to prevent runaway tests.</p>
        </div>
      </div>

      {/* ── Ramp Strategy & Distributed Nodes ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ramp Strategy */}
        <div className="space-y-2">
          <label className="text-xs text-slate-400 font-medium">Ramp Strategy</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'instant' as const, label: 'Instant Spike', hint: 't=0 burst' },
              { id: 'ramp_100ms' as const, label: '100ms Micro-ramp', hint: 'viral spike' },
              { id: 'ramp_1s' as const, label: '1s Smooth Ramp', hint: 'campaign cluster' },
            ].map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => onChange({ ...config, rampStrategy: r.id })}
                className={cn(
                  'flex flex-col text-left p-2.5 rounded-lg border transition-all',
                  config.rampStrategy === r.id
                    ? 'border-rose-500 bg-rose-950/20 text-rose-300 font-medium'
                    : 'border-[#1a3352] bg-[#111f35] text-slate-400 hover:border-slate-600'
                )}
              >
                <span className="text-xs">{r.label}</span>
                <span className="text-[10px] text-slate-500 mt-0.5">{r.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Distributed Nodes */}
        <div className="space-y-2">
          <label className="text-xs text-slate-400 flex items-center justify-between">
            <span>Distributed Nodes (Workers)</span>
            <span className="text-slate-500 font-mono text-[11px]">
              {config.distributedNodes === 1 ? '1 (Local only)' : `${config.distributedNodes} nodes`}
            </span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={100}
              value={config.distributedNodes}
              onChange={(e) => onChange({ ...config, distributedNodes: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-28 bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:border-rose-500"
            />
            <span className="text-xs text-slate-500 leading-tight">
              {config.distributedNodes > 1
                ? `Divides load across local process and up to ${config.distributedNodes - 1} remote agent(s).`
                : 'Local worker only. Maximum achievable throughput is single-node bound.'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Automatic Abort Thresholds ────────────────────────────────────── */}
      <div className="bg-[#0b1626] border border-[#1a3352] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className="text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Auto-Abort Guardrails (Evaluated Every 250ms)
            </h3>
          </div>
          <span className="text-[10px] text-slate-500">Stops new requests immediately to protect target from prolonged downtime</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Max Error Rate (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={config.abortConditions.maxErrorRatePercent}
                onChange={(e) => onChange({
                  ...config,
                  abortConditions: { ...config.abortConditions, maxErrorRatePercent: Math.max(1, parseInt(e.target.value) || 1) }
                })}
                className="w-full bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono text-slate-200"
              />
              <span className="text-xs text-slate-500">%</span>
            </div>
            <p className="text-[10px] text-slate-500">Aborts if rolling error rate exceeds this.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Max p99 Latency (ms)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={100}
                max={60000}
                step={500}
                value={config.abortConditions.maxP99LatencyMs}
                onChange={(e) => onChange({
                  ...config,
                  abortConditions: { ...config.abortConditions, maxP99LatencyMs: Math.max(100, parseInt(e.target.value) || 100) }
                })}
                className="w-full bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono text-slate-200"
              />
              <span className="text-xs text-slate-500">ms</span>
            </div>
            <p className="text-[10px] text-slate-500">Aborts if tail latency collapses.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Consecutive Timeouts</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={5000}
                step={50}
                value={config.abortConditions.consecutiveTimeoutLimit}
                onChange={(e) => onChange({
                  ...config,
                  abortConditions: { ...config.abortConditions, consecutiveTimeoutLimit: Math.max(10, parseInt(e.target.value) || 10) }
                })}
                className="w-full bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono text-slate-200"
              />
              <span className="text-xs text-slate-500">timeouts</span>
            </div>
            <p className="text-[10px] text-slate-500">Detects complete server unresponsiveness.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
