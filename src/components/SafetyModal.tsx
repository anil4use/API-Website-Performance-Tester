'use client'

import { useState } from 'react'
import { AlertTriangle, Shield, X, CheckSquare, Square } from 'lucide-react'
import type { TestConfig } from '@/lib/types'
import { fmtNumber, cn } from '@/lib/utils'

interface Props {
  config: TestConfig
  estimatedRequests: number
  onConfirm: () => void
  onCancel: () => void
}

export default function SafetyModal({ config, estimatedRequests, onConfirm, onCancel }: Props) {
  const [authorized, setAuthorized] = useState(false)
  const [typedHostname, setTypedHostname] = useState('')

  const isBreakpoint = config.type === 'breakpoint'

  let targetHostname = ''
  try {
    targetHostname = new URL(config.target).hostname
  } catch {
    targetHostname = config.target
  }

  const concurrency =
    config.breakpoint?.targetVirtualUsers ??
    config.load?.concurrency ??
    config.stress?.levels?.[config.stress.levels.length - 1] ??
    config.spike?.spikeUsers ??
    config.endurance?.concurrency ??
    config.rateLimit?.concurrency ?? 1

  const targetRps = config.breakpoint?.targetRequestsPerSecond

  const isHeavy = isBreakpoint || concurrency >= 50 || estimatedRequests >= 1000
  const isHostnameMatched = !isBreakpoint || typedHostname.trim().toLowerCase() === targetHostname.toLowerCase()
  const canConfirm = authorized && isHostnameMatched

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative bg-[#0d1b2e] border border-[#1a3352] rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
        <button onClick={onCancel} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300">
          <X size={16} />
        </button>

        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2.5 rounded-xl border',
            isBreakpoint
              ? 'bg-rose-950/40 border-rose-800/40 text-rose-400'
              : 'bg-yellow-900/30 border-yellow-700/30 text-yellow-400'
          )}>
            <Shield size={22} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isBreakpoint ? 'Confirm Extreme Breakpoint Test' : 'Confirm Test Run'}
            </h2>
            <p className="text-xs text-slate-400">
              {isBreakpoint
                ? 'High-risk test — verification required to prevent accidental outages'
                : 'Review test details and confirm authorization before proceeding'}
            </p>
          </div>
        </div>

        {/* Test summary */}
        <div className="bg-[#111f35] border border-[#1a3352] rounded-xl p-4 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Target</span>
            <span className="text-blue-400 font-mono font-medium truncate max-w-[260px]">{config.target}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Test Type</span>
            <span className={cn('font-semibold capitalize', isBreakpoint ? 'text-rose-400 font-mono' : 'text-slate-200')}>
              {isBreakpoint ? 'Breakpoint / Extreme Burst' : config.type}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Method</span>
            <span className="text-slate-200 font-mono">{config.request.method}</span>
          </div>
          {isBreakpoint ? (
            <>
              <div className="flex justify-between">
                <span className="text-slate-500">Simulated Virtual Users</span>
                <span className="text-rose-400 font-mono font-bold">{fmtNumber(concurrency)} users</span>
              </div>
              {targetRps && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Burst RPS</span>
                  <span className="text-rose-400 font-mono font-bold">{fmtNumber(targetRps)} req/sec</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Burst Duration</span>
                <span className="text-slate-200 font-mono">{config.breakpoint?.burstDurationSeconds || 5} seconds</span>
              </div>
            </>
          ) : (
            <>
              {config.type !== 'single' && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Max Concurrency</span>
                  <span className="text-slate-200 font-mono">{fmtNumber(concurrency)} users</span>
                </div>
              )}
              {estimatedRequests > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Estimated Requests</span>
                  <span className="text-yellow-400 font-mono font-bold">{fmtNumber(estimatedRequests)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Warning Banner */}
        {isBreakpoint ? (
          <div className="flex gap-3 bg-rose-950/40 border border-rose-800/50 rounded-xl p-3.5 text-xs text-rose-300 leading-relaxed">
            <AlertTriangle size={18} className="text-rose-400 mt-0.5 shrink-0" />
            <div>
              <strong className="text-rose-200 block mb-0.5">⚠️ Severe Service Disruption Warning</strong>
              This mode generates massive, uncapped burst traffic designed to deliberately push the target to failure.
              It can take production services down, exhaust socket backlogs, starve database pools, and trigger cloud provider DDoS mitigations.
            </div>
          </div>
        ) : isHeavy ? (
          <div className="flex gap-3 bg-yellow-950/30 border border-yellow-900/30 rounded-xl p-3 text-xs text-yellow-300 leading-relaxed">
            <AlertTriangle size={15} className="text-yellow-400 mt-0.5 shrink-0" />
            <p>
              This is a high-volume load test. Ensure the target is a system you own or have explicit written authorization to test.
            </p>
          </div>
        ) : null}

        {/* Type hostname to confirm for Breakpoint mode */}
        {isBreakpoint && (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs text-slate-300 font-medium flex items-center justify-between">
              <span>Type target hostname to confirm:</span>
              <code className="text-blue-400 font-mono bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-900/40">
                {targetHostname}
              </code>
            </label>
            <input
              type="text"
              value={typedHostname}
              onChange={(e) => setTypedHostname(e.target.value)}
              placeholder={`Type "${targetHostname}"`}
              className={cn(
                'w-full bg-[#111f35] border rounded-lg px-3 py-2 text-xs font-mono transition-colors',
                isHostnameMatched && typedHostname.length > 0
                  ? 'border-emerald-500 text-emerald-300'
                  : 'border-[#1a3352] text-slate-200 focus:border-rose-500'
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {typedHostname.length > 0 && !isHostnameMatched && (
              <p className="text-[11px] text-rose-400">Hostname does not match yet.</p>
            )}
          </div>
        )}

        {/* Authorization checkbox */}
        <button
          onClick={() => setAuthorized(!authorized)}
          className="flex items-start gap-3 w-full text-left group pt-1"
        >
          {authorized
            ? <CheckSquare size={16} className="text-blue-500 mt-0.5 shrink-0" />
            : <Square size={16} className="text-slate-600 mt-0.5 shrink-0 group-hover:text-slate-400" />
          }
          <span className="text-xs text-slate-400 leading-relaxed">
            I confirm that I am the owner or have explicit written authorization to stress test{' '}
            <span className="text-blue-400 font-mono">{config.target}</span>,
            and I take full legal responsibility for any resulting service degradation or downtime.
          </span>
        </button>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-[#1a3352] text-sm text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-lg',
              isBreakpoint
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/40 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-950/40 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {isBreakpoint ? 'Confirm & Fire Burst' : 'Run Test'}
          </button>
        </div>
      </div>
    </div>
  )
}
