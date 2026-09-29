'use client'

import { Shield, Globe, RefreshCw, Key, Sparkles, RotateCw, Timer, AlertTriangle, Gauge } from 'lucide-react'
import type { BypassOptions } from '@/lib/types'

interface Props {
  bypass: BypassOptions
  onChange: (b: BypassOptions) => void
}

function randomToken() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return 'lte_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  icon: React.ReactNode
  label: string
  hint: string
}

function Toggle({ checked, onChange, icon, label, hint }: ToggleProps) {
  return (
    <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all select-none ${
      checked ? 'border-blue-600/50 bg-blue-950/25' : 'border-[#1a3352] hover:border-[#2a4060]'
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-blue-500 shrink-0"
      />
      <span className="text-slate-400 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-xs text-slate-600 ml-2">{hint}</span>
      </div>
      {checked && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-400 font-mono shrink-0">ON</span>
      )}
    </label>
  )
}

export default function BypassSection({ bypass, onChange }: Props) {
  function set(key: keyof BypassOptions, value: any) {
    onChange({ ...bypass, [key]: value })
  }

  function toggleBypassHeader(enabled: boolean) {
    // Auto-generate a secret the moment the header bypass is turned on
    onChange({
      ...bypass,
      bypassHeader: enabled,
      bypassHeaderValue: enabled && !bypass.bypassHeaderValue ? randomToken() : bypass.bypassHeaderValue,
    })
  }

  function regenerate() {
    onChange({ ...bypass, bypassHeaderValue: randomToken(), rotateHeaderValue: false })
  }

  const anyActive = bypass.rotateIp || bypass.rotateUserAgent || bypass.bypassHeader || bypass.requestDelay > 0 || bypass.retryOn429 || bypass.maxRps > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={13} className="text-orange-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Rate Limit Bypass</span>
        {anyActive && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-400 border border-orange-800/40">active</span>
        )}
      </div>

      <Toggle
        checked={bypass.rotateIp}
        onChange={v => set('rotateIp', v)}
        icon={<Globe size={14} />}
        label="Rotate IPs"
        hint="— random IP header per request, bypasses IP-based limits"
      />

      <Toggle
        checked={bypass.rotateUserAgent}
        onChange={v => set('rotateUserAgent', v)}
        icon={<RefreshCw size={14} />}
        label="Rotate User-Agents"
        hint="— changes browser fingerprint per request"
      />

      {/* Request pacing */}
      <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all select-none ${
        bypass.requestDelay > 0 ? 'border-blue-600/50 bg-blue-950/25' : 'border-[#1a3352] hover:border-[#2a4060]'
      }`}>
        <Timer size={14} className="text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-200">Request Pacing</span>
          <span className="text-xs text-slate-600 ml-2">— delay between requests per slot, keeps rate under limit</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            min={0}
            max={60000}
            step={100}
            value={bypass.requestDelay}
            onChange={e => set('requestDelay', Math.max(0, Number(e.target.value)))}
            onClick={e => e.preventDefault()}
            className="w-20 bg-[#080f1c] border border-[#1a3352] rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 text-right focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-slate-600">ms</span>
        </div>
      </label>

      {/* Global RPS cap */}
      <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all select-none ${
        bypass.maxRps > 0 ? 'border-blue-600/50 bg-blue-950/25' : 'border-[#1a3352] hover:border-[#2a4060]'
      }`}>
        <Gauge size={14} className="text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-200">Global Rate Cap</span>
          <span className="text-xs text-slate-600 ml-2">— max total requests/sec across all concurrent slots</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            min={0}
            max={10000}
            step={0.5}
            value={bypass.maxRps}
            onChange={e => set('maxRps', Math.max(0, Number(e.target.value)))}
            onClick={e => e.preventDefault()}
            placeholder="0"
            className="w-20 bg-[#080f1c] border border-[#1a3352] rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 text-right focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-slate-600">req/s</span>
        </div>
      </label>

      {/* Auto-retry on 429 */}
      <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all select-none ${
        bypass.retryOn429 ? 'border-blue-600/50 bg-blue-950/25' : 'border-[#1a3352] hover:border-[#2a4060]'
      }`}>
        <input
          type="checkbox"
          checked={bypass.retryOn429}
          onChange={e => set('retryOn429', e.target.checked)}
          className="w-4 h-4 rounded accent-blue-500 shrink-0"
        />
        <AlertTriangle size={14} className="text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-200">Auto-retry on 429</span>
          <span className="text-xs text-slate-600 ml-2">— when blocked, wait and retry automatically</span>
        </div>
        {bypass.retryOn429 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-600">wait</span>
            <input
              type="number"
              min={100}
              max={60000}
              step={100}
              value={bypass.retryDelay}
              onChange={e => set('retryDelay', Math.max(100, Number(e.target.value)))}
              onClick={e => e.preventDefault()}
              className="w-20 bg-[#080f1c] border border-[#1a3352] rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 text-right focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-slate-600">ms</span>
          </div>
        )}
        {bypass.retryOn429 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-400 font-mono shrink-0">ON</span>
        )}
      </label>

      <Toggle
        checked={bypass.bypassHeader}
        onChange={toggleBypassHeader}
        icon={<Key size={14} />}
        label="Custom Bypass Header"
        hint="— sends a header your server can whitelist"
      />

      {bypass.bypassHeader && (
        <div className="ml-1 space-y-2 px-1">
          {/* Header name */}
          <input
            type="text"
            value={bypass.bypassHeaderName}
            onChange={e => set('bypassHeaderName', e.target.value)}
            placeholder="Header name (e.g. X-Load-Test-Key)"
            className="w-full bg-[#080f1c] border border-[#1a3352] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500"
          />

          {/* Value row */}
          {!bypass.rotateHeaderValue ? (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={bypass.bypassHeaderValue}
                onChange={e => set('bypassHeaderValue', e.target.value)}
                placeholder="Secret value"
                className="flex-1 min-w-0 bg-[#080f1c] border border-[#1a3352] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={regenerate}
                title="Auto-generate a new random secret"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#080f1c] border border-[#1a3352] hover:border-blue-500 text-slate-400 hover:text-blue-300 text-xs transition-colors shrink-0"
              >
                <Sparkles size={12} /> Generate
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#080f1c] border border-blue-800/40 text-xs text-blue-400/80 font-mono">
              <RotateCw size={11} className="animate-spin shrink-0" style={{ animationDuration: '3s' }} />
              New random token generated per request
            </div>
          )}

          {/* Rotate toggle */}
          <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all select-none ${
            bypass.rotateHeaderValue ? 'border-blue-600/40 bg-blue-950/20' : 'border-[#1a3352] hover:border-[#2a4060]'
          }`}>
            <input
              type="checkbox"
              checked={bypass.rotateHeaderValue}
              onChange={e => set('rotateHeaderValue', e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-blue-500 shrink-0"
            />
            <RotateCw size={12} className="text-slate-500 shrink-0" />
            <span className="text-xs text-slate-300">Auto-rotate value every request</span>
            <span className="text-[10px] text-slate-600 ml-1">— generates a fresh random token per request automatically</span>
          </label>
        </div>
      )}

      {/* Active summary */}
      {anyActive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-950/20 border border-orange-800/30 text-xs text-orange-300/80">
          <Shield size={11} className="shrink-0" />
          <span>
            Active:&nbsp;
            {[
              bypass.maxRps > 0 && `${bypass.maxRps} req/s cap`,
              bypass.rotateIp && 'IP rotation',
              bypass.rotateUserAgent && 'UA rotation',
              bypass.requestDelay > 0 && `${bypass.requestDelay}ms pacing`,
              bypass.retryOn429 && `retry on 429 (${bypass.retryDelay}ms wait)`,
              bypass.bypassHeader && bypass.bypassHeaderName && `${bypass.bypassHeaderName} header`,
            ].filter(Boolean).join(' + ')}
          </span>
        </div>
      )}
    </div>
  )
}
