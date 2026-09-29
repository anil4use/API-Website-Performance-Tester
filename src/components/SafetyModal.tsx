'use client'

import { useState } from 'react'
import { AlertTriangle, Shield, X, CheckSquare, Square } from 'lucide-react'
import type { TestConfig } from '@/lib/types'
import { fmtNumber } from '@/lib/utils'

interface Props {
  config: TestConfig
  estimatedRequests: number
  onConfirm: () => void
  onCancel: () => void
}

export default function SafetyModal({ config, estimatedRequests, onConfirm, onCancel }: Props) {
  const [authorized, setAuthorized] = useState(false)

  const concurrency =
    config.load?.concurrency ??
    config.stress?.levels?.[config.stress.levels.length - 1] ??
    config.spike?.spikeUsers ??
    config.endurance?.concurrency ??
    config.rateLimit?.concurrency ?? 1

  const isHeavy = concurrency >= 50 || estimatedRequests >= 1000

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative bg-[#0d1b2e] border border-[#1a3352] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <button onClick={onCancel} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300">
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-xl bg-yellow-900/30 border border-yellow-700/30">
            <Shield size={20} className="text-yellow-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Confirm Test Run</h2>
            <p className="text-xs text-slate-500">Review the test details before proceeding</p>
          </div>
        </div>

        {/* Test summary */}
        <div className="bg-[#111f35] border border-[#1a3352] rounded-xl p-4 space-y-2 mb-5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Target</span>
            <span className="text-blue-400 font-mono truncate max-w-[220px]">{config.target}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Test Type</span>
            <span className="text-slate-200 capitalize">{config.type}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Method</span>
            <span className="text-slate-200 font-mono">{config.request.method}</span>
          </div>
          {config.type !== 'single' && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Max Concurrency</span>
                <span className="text-slate-200 font-mono">{fmtNumber(concurrency)} users</span>
              </div>
              {estimatedRequests > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Estimated Requests</span>
                  <span className="text-yellow-400 font-mono font-bold">{fmtNumber(estimatedRequests)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Warning */}
        {isHeavy && (
          <div className="flex gap-3 bg-yellow-950/30 border border-yellow-900/30 rounded-xl p-3 mb-5">
            <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-300 leading-relaxed">
              This is a {config.type === 'stress' ? 'high-intensity stress' : 'high-volume'} test.
              Ensure the target is a system you own or have explicit authorization to test.
              Unauthorized testing may violate laws and terms of service.
            </p>
          </div>
        )}

        {/* Authorization checkbox */}
        <button
          onClick={() => setAuthorized(!authorized)}
          className="flex items-start gap-3 w-full text-left mb-5 group"
        >
          {authorized
            ? <CheckSquare size={16} className="text-blue-500 mt-0.5 shrink-0" />
            : <Square size={16} className="text-slate-600 mt-0.5 shrink-0 group-hover:text-slate-400" />
          }
          <span className="text-xs text-slate-400 leading-relaxed">
            I confirm that I am the owner or have explicit written authorization to test{' '}
            <span className="text-blue-400 font-mono">{config.target}</span>,
            and I take full responsibility for this test.
          </span>
        </button>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-[#1a3352] text-sm text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!authorized}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-sm text-white font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Run Test
          </button>
        </div>
      </div>
    </div>
  )
}
