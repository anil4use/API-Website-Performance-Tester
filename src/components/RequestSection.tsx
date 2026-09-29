'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Code2, Key, Cookie, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RequestConfig, HttpMethod, AuthType, ContentType, AuthConfig } from '@/lib/types'
import { getAvailableGenerators } from '@/lib/generators'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-blue-400',
  PUT: 'text-yellow-400',
  PATCH: 'text-orange-400',
  DELETE: 'text-red-400',
  HEAD: 'text-purple-400',
  OPTIONS: 'text-pink-400',
}

const CONTENT_TYPES: ContentType[] = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'text/xml',
  'application/xml',
  'none',
]

interface KVEditorProps {
  label: string
  pairs: Record<string, string>
  onChange: (pairs: Record<string, string>) => void
  placeholder?: [string, string]
  mono?: boolean
}

function KVEditor({ label, pairs, onChange, placeholder = ['Key', 'Value'], mono }: KVEditorProps) {
  const entries = Object.entries(pairs)

  function update(idx: number, field: 'key' | 'value', val: string) {
    const next = [...entries]
    next[idx] = field === 'key' ? [val, next[idx][1]] : [next[idx][0], val]
    onChange(Object.fromEntries(next.filter(([k]) => k !== '')))
  }

  function remove(idx: number) {
    const next = entries.filter((_, i) => i !== idx)
    onChange(Object.fromEntries(next))
  }

  function add() {
    onChange({ ...pairs, '': '' })
  }

  return (
    <div className="space-y-2">
      {entries.map(([k, v], idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <input
            value={k}
            onChange={(e) => update(idx, 'key', e.target.value)}
            placeholder={placeholder[0]}
            className={cn(
              'flex-1 bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none',
              mono && 'font-mono'
            )}
          />
          <input
            value={v}
            onChange={(e) => update(idx, 'value', e.target.value)}
            placeholder={placeholder[1]}
            className={cn(
              'flex-1 bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none',
              mono && 'font-mono'
            )}
          />
          <button onClick={() => remove(idx)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Plus size={12} /> Add {label}
      </button>
    </div>
  )
}

interface Props {
  config: RequestConfig
  onChange: (config: RequestConfig) => void
}

type Tab = 'params' | 'headers' | 'body' | 'auth' | 'cookies'

export default function RequestSection({ config, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('headers')
  const [showGenerators, setShowGenerators] = useState(false)

  function update<K extends keyof RequestConfig>(key: K, value: RequestConfig[K]) {
    onChange({ ...config, [key]: value })
  }

  function updateAuth<K extends keyof AuthConfig>(key: K, value: AuthConfig[K]) {
    onChange({ ...config, auth: { ...config.auth, [key]: value } })
  }

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(config.method)
  const bodyCount = config.body ? 1 : 0
  const headerCount = Object.keys(config.headers).filter(k => k).length
  const paramCount = Object.keys(config.queryParams).filter(k => k).length
  const cookieCount = Object.keys(config.cookies).filter(k => k).length

  function tabLabel(tab: Tab, count: number) {
    return count > 0 ? `${tab} (${count})` : tab
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'params', label: tabLabel('params', paramCount) },
    { id: 'headers', label: tabLabel('headers', headerCount) },
    { id: 'body', label: tabLabel('body', bodyCount) },
    { id: 'auth', label: config.auth.type !== 'none' ? 'auth ●' : 'auth' },
    { id: 'cookies', label: tabLabel('cookies', cookieCount) },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Code2 size={16} className="text-blue-400" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Request Configuration</h2>
      </div>

      {/* Method + timeout row */}
      <div className="flex gap-3">
        <select
          value={config.method}
          onChange={(e) => update('method', e.target.value as HttpMethod)}
          className="bg-[#111f35] border border-[#1a3352] rounded-lg py-2.5 px-3 text-sm font-mono font-bold focus:border-blue-500 focus:outline-none min-w-[110px]"
          style={{ color: METHOD_COLORS[config.method] }}
        >
          {METHODS.map(m => (
            <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>{m}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-slate-500 whitespace-nowrap">Timeout</span>
          <input
            type="number"
            value={config.timeout / 1000}
            onChange={(e) => update('timeout', parseInt(e.target.value) * 1000 || 30000)}
            min={1} max={300}
            className="w-20 bg-[#111f35] border border-[#1a3352] rounded-lg py-2.5 px-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-slate-500">sec</span>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={config.followRedirects}
            onChange={(e) => update('followRedirects', e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-blue-500"
          />
          Follow redirects
        </label>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-0 border-b border-[#1a3352] mb-3">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'px-4 py-2 text-xs font-medium transition-all border-b-2 -mb-px capitalize',
                activeTab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'params' && (
          <KVEditor
            label="param"
            pairs={config.queryParams}
            onChange={(v) => update('queryParams', v)}
            placeholder={['Parameter', 'Value']}
          />
        )}

        {activeTab === 'headers' && (
          <KVEditor
            label="header"
            pairs={config.headers}
            onChange={(v) => update('headers', v)}
            placeholder={['Header name', 'Value']}
            mono
          />
        )}

        {activeTab === 'body' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500">Content-Type</label>
              <select
                value={config.contentType}
                onChange={(e) => update('contentType', e.target.value as ContentType)}
                className="bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              >
                {CONTENT_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
              <button
                onClick={() => setShowGenerators(!showGenerators)}
                className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors ml-auto"
              >
                {showGenerators ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Variables
              </button>
            </div>

            {showGenerators && (
              <div className="bg-[#0d1b2e] border border-[#1a3352] rounded-lg p-3 text-xs space-y-1">
                <p className="text-slate-500 mb-2">Click to insert into body:</p>
                <div className="flex flex-wrap gap-1">
                  {getAvailableGenerators().map(g => (
                    <button
                      key={g.variable}
                      onClick={() => update('body', (config.body ?? '') + g.variable)}
                      className="px-2 py-1 bg-purple-900/30 border border-purple-700/30 rounded text-purple-300 font-mono hover:bg-purple-900/50 transition-colors"
                      title={`${g.description} (e.g. ${g.example})`}
                    >
                      {g.variable}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={config.body ?? ''}
              onChange={(e) => update('body', e.target.value)}
              placeholder={hasBody ? '{\n  "key": "value"\n}' : 'Body not sent for this method (GET/HEAD/OPTIONS)'}
              rows={8}
              disabled={!hasBody}
              className={cn(
                'w-full bg-[#0d1b2e] border border-[#1a3352] rounded-lg px-4 py-3 text-sm font-mono resize-y focus:border-blue-500 focus:outline-none',
                !hasBody && 'opacity-40 cursor-not-allowed'
              )}
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'auth' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Key size={14} className="text-slate-500" />
              <select
                value={config.auth.type}
                onChange={(e) => updateAuth('type', e.target.value as AuthType)}
                className="bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="api-key">API Key</option>
              </select>
            </div>

            {config.auth.type === 'bearer' && (
              <input
                type="text"
                value={config.auth.token ?? ''}
                onChange={(e) => updateAuth('token', e.target.value)}
                placeholder="Bearer token..."
                className="w-full bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
              />
            )}

            {config.auth.type === 'basic' && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={config.auth.username ?? ''}
                  onChange={(e) => updateAuth('username', e.target.value)}
                  placeholder="Username"
                  className="bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={config.auth.password ?? ''}
                  onChange={(e) => updateAuth('password', e.target.value)}
                  placeholder="Password"
                  className="bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {config.auth.type === 'api-key' && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={config.auth.apiKeyHeader ?? 'X-API-Key'}
                  onChange={(e) => updateAuth('apiKeyHeader', e.target.value)}
                  placeholder="Header name"
                  className="bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={config.auth.apiKey ?? ''}
                  onChange={(e) => updateAuth('apiKey', e.target.value)}
                  placeholder="API key value"
                  className="bg-[#0d1b2e] border border-[#1a3352] rounded-md px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'cookies' && (
          <KVEditor
            label="cookie"
            pairs={config.cookies}
            onChange={(v) => update('cookies', v)}
            placeholder={['Cookie name', 'Value']}
            mono
          />
        )}
      </div>
    </section>
  )
}
