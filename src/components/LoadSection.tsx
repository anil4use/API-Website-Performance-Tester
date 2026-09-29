'use client'

import { Settings } from 'lucide-react'
import type {
  TestType, LoadConfig, StressConfig, SpikeConfig, EnduranceConfig, RateLimitConfig,
} from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  testType: TestType
  load: LoadConfig
  stress: StressConfig
  spike: SpikeConfig
  endurance: EnduranceConfig
  rateLimit: RateLimitConfig
  onLoad: (c: LoadConfig) => void
  onStress: (c: StressConfig) => void
  onSpike: (c: SpikeConfig) => void
  onEndurance: (c: EnduranceConfig) => void
  onRateLimit: (c: RateLimitConfig) => void
}

function NumInput({
  label, value, onChange, min = 1, max = 1_000_000, step = 1, unit = '',
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
          }}
          min={min} max={max} step={step}
          className="w-32 bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
        />
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  )
}

const STRESS_LEVEL_PRESETS: number[][] = [
  [10, 25, 50, 100, 250, 500],
  [10, 50, 100, 250, 500, 1000, 2000],
  [1, 5, 10, 25, 50, 100, 200, 500],
]

export default function LoadSection({
  testType, load, stress, spike, endurance, rateLimit,
  onLoad, onStress, onSpike, onEndurance, onRateLimit,
}: Props) {
  if (testType === 'single') return null

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Settings size={16} className="text-blue-400" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {testType === 'load' && 'Load Configuration'}
          {testType === 'stress' && 'Stress Configuration'}
          {testType === 'spike' && 'Spike Configuration'}
          {testType === 'endurance' && 'Endurance Configuration'}
          {testType === 'rate-limit' && 'Rate Limit Configuration'}
        </h2>
      </div>

      {/* LOAD */}
      {testType === 'load' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <NumInput label="Concurrent Users" value={load.concurrency} onChange={v => onLoad({ ...load, concurrency: v })} min={1} max={10000} />
            <NumInput label="Total Requests" value={load.totalRequests ?? 1000} onChange={v => onLoad({ ...load, totalRequests: v })} min={1} max={10_000_000} />
            <NumInput label="Duration" value={load.duration ?? 0} onChange={v => onLoad({ ...load, duration: v || undefined })} min={0} max={86400} unit="sec" hint="0 = use total requests only" />
            <NumInput label="Ramp-up Time" value={load.rampUpTime ?? 0} onChange={v => onLoad({ ...load, rampUpTime: v || undefined })} min={0} max={3600} unit="sec" />
            <NumInput label="Ramp-down Time" value={load.rampDownTime ?? 0} onChange={v => onLoad({ ...load, rampDownTime: v || undefined })} min={0} max={3600} unit="sec" />
            <NumInput label="Target RPS" value={load.requestsPerSecond ?? 0} onChange={v => onLoad({ ...load, requestsPerSecond: v || undefined })} min={0} max={100000} hint="0 = unlimited" />
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-600 self-center">Presets:</span>
            {[
              { label: 'Smoke', c: 1, r: 10 },
              { label: 'Low', c: 10, r: 100 },
              { label: 'Medium', c: 50, r: 1000 },
              { label: 'High', c: 100, r: 10000 },
              { label: 'Heavy', c: 500, r: 50000 },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => onLoad({ ...load, concurrency: p.c, totalRequests: p.r })}
                className="px-3 py-1 text-xs rounded border border-[#1a3352] text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-all"
              >
                {p.label} ({p.c}u / {p.r.toLocaleString()}req)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STRESS */}
      {testType === 'stress' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <NumInput label="Duration Per Level" value={stress.levelDuration} onChange={v => onStress({ ...stress, levelDuration: v })} min={5} max={3600} unit="sec" />
            <NumInput label="Ramp Between Levels" value={stress.rampBetweenLevels} onChange={v => onStress({ ...stress, rampBetweenLevels: v })} min={0} max={300} unit="sec" />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-2">Concurrency Levels</label>
            <input
              type="text"
              value={stress.levels.join(', ')}
              onChange={(e) => {
                const levels = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
                if (levels.length > 0) onStress({ ...stress, levels })
              }}
              placeholder="10, 25, 50, 100, 250, 500"
              className="w-full bg-[#111f35] border border-[#1a3352] rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-slate-600 self-center">Presets:</span>
              {STRESS_LEVEL_PRESETS.map((preset, i) => (
                <button key={i} onClick={() => onStress({ ...stress, levels: preset })}
                  className="px-2 py-1 text-xs rounded border border-[#1a3352] text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-all">
                  {preset.join('→')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SPIKE */}
      {testType === 'spike' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <NumInput label="Normal Users" value={spike.normalUsers} onChange={v => onSpike({ ...spike, normalUsers: v })} min={1} max={10000} />
          <NumInput label="Spike Users" value={spike.spikeUsers} onChange={v => onSpike({ ...spike, spikeUsers: v })} min={1} max={100000} />
          <NumInput label="Normal Duration" value={spike.normalDuration} onChange={v => onSpike({ ...spike, normalDuration: v })} unit="sec" min={5} max={3600} />
          <NumInput label="Spike Duration" value={spike.spikeDuration} onChange={v => onSpike({ ...spike, spikeDuration: v })} unit="sec" min={5} max={3600} />
          <NumInput label="Recovery Duration" value={spike.recoveryDuration} onChange={v => onSpike({ ...spike, recoveryDuration: v })} unit="sec" min={5} max={3600} />
        </div>
      )}

      {/* ENDURANCE */}
      {testType === 'endurance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <NumInput label="Concurrent Users" value={endurance.concurrency} onChange={v => onEndurance({ ...endurance, concurrency: v })} min={1} max={1000} />
            <NumInput label="Duration" value={endurance.duration} onChange={v => onEndurance({ ...endurance, duration: v })} unit="sec" min={60} max={86400} />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-600 self-center">Presets:</span>
            {[
              { label: '10 min', s: 600 }, { label: '30 min', s: 1800 },
              { label: '1 hour', s: 3600 }, { label: '2 hours', s: 7200 },
            ].map(p => (
              <button key={p.label} onClick={() => onEndurance({ ...endurance, duration: p.s })}
                className="px-3 py-1 text-xs rounded border border-[#1a3352] text-slate-400 hover:border-emerald-500 hover:text-emerald-300 transition-all">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RATE LIMIT */}
      {testType === 'rate-limit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <NumInput label="Total Requests" value={rateLimit.totalRequests} onChange={v => onRateLimit({ ...rateLimit, totalRequests: v })} min={10} max={1_000_000} />
            <NumInput label="Concurrency" value={rateLimit.concurrency} onChange={v => onRateLimit({ ...rateLimit, concurrency: v })} min={1} max={1000} />
          </div>
          <p className="text-xs text-slate-500">
            Sends the configured number of requests to observe rate limiting behavior. 429 responses and Retry-After headers will be tracked.
          </p>
        </div>
      )}
    </section>
  )
}
