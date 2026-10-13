'use client'

import { Zap, BarChart2, TrendingUp, Activity, Clock, Shield, Globe, GitBranch, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TestType } from '@/lib/types'

interface TestTypeDef {
  id: TestType
  label: string
  icon: React.ElementType
  description: string
  color: string
}

const TEST_TYPES: TestTypeDef[] = [
  {
    id: 'single',
    label: 'Single Request',
    icon: Zap,
    description: 'Execute one request and inspect full response details, timing breakdown, and headers.',
    color: 'text-purple-400',
  },
  {
    id: 'load',
    label: 'Load Test',
    icon: BarChart2,
    description: 'Sustained load with configurable concurrency, total requests, and duration.',
    color: 'text-blue-400',
  },
  {
    id: 'stress',
    label: 'Stress Test',
    icon: TrendingUp,
    description: 'Gradually increase concurrency to find performance thresholds and breaking points.',
    color: 'text-yellow-400',
  },
  {
    id: 'spike',
    label: 'Spike Test',
    icon: Activity,
    description: 'Sudden traffic surge from baseline to peak, then recovery — measures resilience.',
    color: 'text-orange-400',
  },
  {
    id: 'breakpoint',
    label: 'Breakpoint Burst',
    icon: Flame,
    description: 'Extreme-scale burst test (up to 100k+ VUs, 1M+ RPS) to deliberately surface breaking points before production.',
    color: 'text-rose-400',
  },
  {
    id: 'endurance',
    label: 'Endurance / Soak',
    icon: Clock,
    description: 'Sustained load over a long period. Detects memory leaks and slow degradation.',
    color: 'text-emerald-400',
  },
  {
    id: 'rate-limit',
    label: 'Rate Limit',
    icon: Shield,
    description: 'Probe the target\'s rate limiting behavior and observe 429 thresholds.',
    color: 'text-red-400',
  },
]

interface Props {
  selected: TestType
  onChange: (t: TestType) => void
}

export default function TestTypeSection({ selected, onChange }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={16} className="text-blue-400" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Test Type</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {TEST_TYPES.map((t) => {
          const Icon = t.icon
          const isActive = selected === t.id
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                'relative flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all',
                isActive
                  ? 'border-blue-500 bg-blue-900/20 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]'
                  : 'border-[#1a3352] bg-[#111f35] hover:border-blue-700/50 hover:bg-[#142030]'
              )}
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className={isActive ? t.color : 'text-slate-500'} />
                <span className={cn('text-sm font-medium', isActive ? 'text-slate-100' : 'text-slate-400')}>
                  {t.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed hidden md:block">{t.description}</p>
              {isActive && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
