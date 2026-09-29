'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Trash2, GitCompare, Eye, RefreshCw, X } from 'lucide-react'
import type { HistoryDetail, TestReport } from '@/lib/types'
import { fmtMs, fmtNumber, fmtRps, cn } from '@/lib/utils'
import TestReportView from './TestReportView'

interface Props {
  onClose: () => void
  onLoadConfig?: (detail: HistoryDetail) => void
}

export default function HistoryPanel({ onClose, onLoadConfig }: Props) {
  const [entries, setEntries] = useState<HistoryDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TestReport | null>(null)
  const [compare, setCompare] = useState<string[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/tests?limit=50')
      const data = await res.json()
      setEntries(data.history ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteEntry(id: string) {
    await fetch(`/api/tests/${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
    if (selected?.testId === id) setSelected(null)
  }

  async function viewReport(entry: HistoryDetail) {
    const report = JSON.parse(entry.reportSnapshot) as TestReport
    setSelected(report)
  }

  function toggleCompare(id: string) {
    setCompare(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    )
  }

  const compareEntries = entries.filter(e => compare.includes(e.id))

  const typeColors: Record<string, string> = {
    single: 'text-purple-400',
    load: 'text-blue-400',
    stress: 'text-yellow-400',
    spike: 'text-orange-400',
    endurance: 'text-emerald-400',
    'rate-limit': 'text-red-400',
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-3xl bg-[#0d1b2e] border-l border-[#1a3352] flex flex-col h-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3352]">
          <h2 className="text-sm font-semibold text-slate-200">Test History</h2>
          <div className="flex items-center gap-3">
            <button onClick={load} className="text-slate-500 hover:text-slate-300 transition-colors">
              <RefreshCw size={14} />
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Compare bar */}
        {compare.length === 2 && (
          <div className="px-6 py-3 bg-blue-950/30 border-b border-blue-900/30">
            <p className="text-xs text-blue-400 font-medium mb-2">Comparing 2 tests</p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              {compareEntries.map((e, i) => (
                <div key={e.id}>
                  <p className="text-slate-400 truncate">{e.testName}</p>
                  <div className="flex gap-4 mt-1 font-mono">
                    <span className="text-slate-500">p95: <span className="text-slate-300">{fmtMs(e.p95)}</span></span>
                    <span className="text-slate-500">err: <span className={e.errorRate > 1 ? 'text-red-400' : 'text-emerald-400'}>{e.errorRate.toFixed(1)}%</span></span>
                    <span className="text-slate-500">rps: <span className="text-slate-300">{fmtRps(e.requestsPerSecond)}</span></span>
                  </div>
                  {i === 1 && compareEntries[0] && (
                    <div className="flex gap-4 mt-1 font-mono text-[10px]">
                      <span className={compareEntries[1].p95 < compareEntries[0].p95 ? 'text-emerald-400' : 'text-red-400'}>
                        p95: {compareEntries[1].p95 < compareEntries[0].p95 ? '↓' : '↑'}{' '}
                        {Math.abs(compareEntries[1].p95 - compareEntries[0].p95).toFixed(0)}ms
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* List */}
          <div className={cn('flex-1 overflow-y-auto', selected && 'w-80 shrink-0')}>
            {loading && (
              <div className="p-6 text-xs text-slate-500 text-center">Loading history…</div>
            )}
            {!loading && entries.length === 0 && (
              <div className="p-6 text-xs text-slate-500 text-center">No test history yet.</div>
            )}
            {entries.map(entry => (
              <div
                key={entry.id}
                className={cn(
                  'px-5 py-4 border-b border-[#1a3352]/50 hover:bg-[#111f35] transition-colors',
                  selected?.testId === entry.id && 'bg-[#111f35]'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs font-medium', typeColors[entry.testType] ?? 'text-slate-400')}>
                        {entry.testType}
                      </span>
                      <span className="text-xs text-slate-300 truncate">{entry.testName}</span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate mt-0.5">{entry.target}</p>
                    <div className="flex gap-3 mt-1.5 text-[11px] font-mono">
                      <span className="text-slate-500">
                        {fmtNumber(entry.totalRequests)} req
                      </span>
                      <span className="text-slate-500">
                        p95: <span className="text-slate-300">{fmtMs(entry.p95)}</span>
                      </span>
                      <span className={entry.errorRate > 1 ? 'text-red-400' : 'text-slate-500'}>
                        err: {entry.errorRate.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1">
                      {format(new Date(entry.startedAt), 'MMM d, HH:mm')}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => viewReport(entry)}
                      className="p-1.5 text-slate-600 hover:text-blue-400 transition-colors"
                      title="View report"
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      onClick={() => toggleCompare(entry.id)}
                      className={cn('p-1.5 transition-colors', compare.includes(entry.id) ? 'text-blue-400' : 'text-slate-600 hover:text-blue-400')}
                      title="Compare"
                    >
                      <GitCompare size={13} />
                    </button>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Report detail */}
          {selected && (
            <div className="flex-1 overflow-y-auto border-l border-[#1a3352] p-5">
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-4 transition-colors"
              >
                <X size={12} /> Close report
              </button>
              <TestReportView
                report={selected}
                onExport={(fmt) => {
                  window.open(`/api/tests/${selected.testId}/export?format=${fmt}`, '_blank')
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
