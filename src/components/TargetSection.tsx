'use client'

import { useState } from 'react'
import { Globe, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HttpMethod, AuthConfig } from '@/lib/types'

interface Props {
  url: string
  name: string
  onUrlChange: (v: string) => void
  onNameChange: (v: string) => void
}

export default function TargetSection({ url, name, onUrlChange, onNameChange }: Props) {
  const [urlError, setUrlError] = useState('')

  function validate(v: string) {
    if (!v) { setUrlError(''); return }
    try {
      const u = new URL(v)
      if (!['http:', 'https:'].includes(u.protocol)) {
        setUrlError('Only http:// and https:// are supported')
      } else {
        setUrlError('')
      }
    } catch {
      setUrlError('Invalid URL format')
    }
  }

  const isHttps = url.startsWith('https://')
  const isHttp = url.startsWith('http://') && !url.startsWith('https://')
  const isValid = url.length > 0 && !urlError

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={16} className="text-blue-400" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Target</h2>
      </div>

      {/* URL input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
          {isHttps && <Lock size={14} className="text-emerald-400" />}
          {isHttp && <AlertTriangle size={14} className="text-yellow-400" />}
          {!url && <Globe size={14} className="text-slate-500" />}
        </div>
        <input
          type="text"
          value={url}
          onChange={(e) => { onUrlChange(e.target.value); validate(e.target.value) }}
          placeholder="https://api.example.com/endpoint"
          className={cn(
            'w-full bg-[#111f35] border rounded-lg py-3 pl-9 pr-4 text-sm font-mono transition-all',
            urlError
              ? 'border-red-500/60 focus:border-red-500'
              : isValid
              ? 'border-emerald-500/40 focus:border-emerald-400'
              : 'border-[#1a3352] focus:border-blue-500'
          )}
          spellCheck={false}
          autoComplete="off"
        />
        {isValid && (
          <CheckCircle2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400" />
        )}
      </div>

      {urlError && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle size={12} /> {urlError}
        </p>
      )}

      {isHttp && !urlError && url.length > 0 && (
        <p className="text-xs text-yellow-400 flex items-center gap-1">
          <AlertTriangle size={12} /> HTTP (unencrypted) — use HTTPS in production environments.
        </p>
      )}

      {/* Test name */}
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Test name (optional, e.g. User API load test)"
        className="w-full bg-[#111f35] border border-[#1a3352] rounded-lg py-2.5 px-4 text-sm focus:border-blue-500 focus:outline-none"
      />
    </section>
  )
}
