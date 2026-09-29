# API Performance Tester — Full Roadmap

**Project:** Local API & Website Performance Testing Platform  
**Stack:** Next.js 14, TypeScript, Tailwind CSS, MongoDB, Node.js worker_threads  
**Port:** 4004  
**Last updated:** 2026-09-29

---

## Phase 1 — Core Engine (DONE)

### Infrastructure
- [x] Next.js 14 App Router on port 4004
- [x] TypeScript + Tailwind CSS
- [x] MongoDB history (`test_history` collection)
- [x] Plain JS worker (`load-worker.js`) via `worker_threads`
- [x] SSE live streaming endpoint (`/api/tests/[id]/stream`)
- [x] URL state persistence (Base64 encoded — shareable links)
- [x] SSRF protection (blocks private IPs, localhost, cloud metadata)
- [x] Safety confirmation modal before any load test

### Test Types
- [x] Single Request — full timing (DNS, TCP, TLS, TTFB, transfer)
- [x] Load Test — concurrency, total requests, duration, ramp-up, ramp-down, target RPS
- [x] Stress Test — stepped concurrency levels (10→25→50→100→250→500)
- [x] Spike Test — normal → spike → recovery phases
- [x] Endurance / Soak Test — sustained load over long duration
- [x] Rate Limit Test — probes 429 behavior

### Live Dashboard
- [x] Real-time metric cards (requests, success rate, avg/p95/p99, throughput, errors)
- [x] 4 live Recharts (Throughput, Response Time, Error Rate, Concurrency)
- [x] LIVE indicator during active test
- [x] Pause / Resume / Stop controls

### Request Configuration
- [x] Method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- [x] Params, Headers, Body, Auth (Bearer/Basic/API Key), Cookies tabs
- [x] Timeout + follow redirects options
- [x] Load presets: Smoke / Low / Medium / High / Heavy

### Reports & Export
- [x] Latency distribution table (min, avg, p50, p75, p90, p95, p99, p99.9, max)
- [x] Request breakdown (2xx, 3xx, 4xx, 429, 5xx, timeouts, failures)
- [x] Rule-based auto-generated observations
- [x] Export: JSON / CSV / HTML
- [x] MongoDB-backed history panel (view, delete past tests)

---

## Phase 2 — UI Stability & Developer Experience

> **Goal:** Fix the known UX cracks before building new features.  
> **Est. time:** 3–4 days

### State Management Refactor
- [ ] Replace 15+ `useState` hooks in `page.tsx` with `zustand` global store
- [ ] Split 700-line `page.tsx` into focused components
- [ ] Add `@tanstack/react-query` for history / report data fetching

### Terminal Virtualization
- [ ] Add `@tanstack/react-virtual` to `LiveTerminal.tsx`
- [ ] Currently freezes/crashes at 10,000+ log lines — fix this
- [ ] Add terminal search / filter by status code or error keyword

### UI Polish
- [ ] `framer-motion` — smooth sidebar slide, metric card transitions
- [ ] `react-resizable-panels` — draggable split between terminal and report (not fixed 50/50)
- [ ] `@tanstack/react-table` — sortable/filterable history table
- [ ] Dark/light mode toggle
- [ ] Keyboard shortcuts: `Ctrl+Enter` run, `Escape` stop, `Ctrl+H` history

### Export Improvements
- [ ] PDF export of final report (`jspdf` + `html2canvas`)
- [ ] Excel export (`xlsx`) — full latency data per request
- [ ] Shareable report link (store report in MongoDB, expose public URL)

### Local Dev Mode
- [ ] Persistent "Allow Local Testing" toggle (currently resets on reload)
- [ ] Allow `localhost`, `127.0.0.1`, `192.168.x.x` when toggled on
- [ ] Required for testing your own local Node.js / Express apps

---

## Phase 3 — Multi-Project Hub

> **Goal:** Register all your projects once. See live status of all of them from one dashboard.  
> **Est. time:** 4–5 days

### Project Registry
- [ ] New MongoDB collection: `projects`
- [ ] Project schema: `{ id, name, env, baseUrl, healthEndpoint, auth, tags, color }`
- [ ] Credential storage — encrypted at rest using `ENCRYPTION_KEY` env variable
- [ ] CRUD API routes:
  - `POST   /api/projects` — register project
  - `GET    /api/projects` — list all
  - `PUT    /api/projects/[id]` — update credentials
  - `DELETE /api/projects/[id]` — remove
  - `GET    /api/projects/[id]/ping` — one-time health check

### Live Projects Dashboard (`/projects`)
- [ ] Grid of cards — one per registered project
- [ ] Each card shows: name, URL, env badge, live latency, uptime %, last status
- [ ] Color-coded status: green (healthy) / yellow (slow) / red (down)
- [ ] Click card → jump directly into test config pre-filled for that project
- [ ] [Quick Test] button on each card — runs a smoke test instantly

### Background Health Monitor
- [ ] Pings every registered project every 30 seconds
- [ ] Stores results in `health_snapshots` MongoDB collection
- [ ] Uptime % calculated from last 24h of snapshots
- [ ] SSE endpoint: `GET /api/projects/stream` — pushes live status of ALL projects simultaneously
- [ ] Configurable via `MONITOR_INTERVAL` env variable (default: 30000ms)

### Multi-Project Analytics
- [ ] Line chart — response time trend for all projects on one graph (last 1h / 6h / 24h)
- [ ] Alerts panel — list of projects currently degraded or down
- [ ] Historical uptime table per project

---

## Phase 4 — SDK Integration (Easy Setup in Your Apps)

> **Goal:** Add ONE line to any Node.js app. It auto-connects to this testing tool, registers all APIs from a config file, and streams real metrics.  
> **Est. time:** 5–6 days

### The SDK File (`perf.sdk.ts`)
- [ ] Single file — no npm install, just copy into your project
- [ ] Works with Express, Fastify, NestJS, plain Node http
- [ ] Registers the app with the testing tool on startup
- [ ] Adds `GET /__perf/ping` health endpoint automatically
- [ ] Optional request middleware — captures real latency/status per route and streams to dashboard

```typescript
// server.ts — ONE line added
import { connectTester } from './perf.sdk'
connectTester(app, {
  testerUrl: 'http://localhost:4004',
  projectId: 'my-api',
  token: process.env.PERF_TOKEN,
})
```

### The Config File (`perf.config.ts`)
- [ ] One file per project — lives in the project root
- [ ] Lists all API endpoints with test payloads and mock data
- [ ] Supports variable chaining: `{{LOGIN_TOKEN}}`, `{{USER_ID}}`, `{{CARD_ID}}`
- [ ] Variables extracted from previous response (by JSON path or header)
- [ ] Per-API auth override, custom headers, content type

```typescript
// perf.config.ts — in your project root
export default {
  project: 'CardDay API',
  baseUrl: 'http://localhost:3000',
  auth: { type: 'bearer', loginPath: '/api/auth/login',
          body: { email: 'test@test.com', password: 'Test@1234' },
          tokenPath: 'response.token' },
  apis: [
    { name: 'Login',        method: 'POST',   path: '/api/auth/login',
      payload: { email: 'test@test.com', password: 'Test@1234' },
      extract: { LOGIN_TOKEN: 'token', USER_ID: 'userId' } },
    { name: 'Get Cards',    method: 'GET',    path: '/api/cards',
      auth: '{{LOGIN_TOKEN}}' },
    { name: 'Create Card',  method: 'POST',   path: '/api/cards',
      auth: '{{LOGIN_TOKEN}}',
      payload: { name: 'Test Card', limit: 5000, currency: 'GBP' },
      extract: { CARD_ID: 'id' } },
    { name: 'Delete Card',  method: 'DELETE', path: '/api/cards/{{CARD_ID}}',
      auth: '{{LOGIN_TOKEN}}' },
  ]
}
```

### Auto-Discovery in the Testing Tool
- [ ] When a connected app registers, all APIs from its `perf.config.ts` appear automatically in the UI
- [ ] No manual URL entry needed — just pick from the dropdown
- [ ] Payload pre-filled from config — ready to test immediately
- [ ] "Run All APIs" button — smoke tests every endpoint in sequence

### Live Real Metrics (from inside your app)
- [ ] SDK middleware captures per-route: latency avg/p95/p99, error rate, req/sec
- [ ] Streams to `/api/ingest` on this tool every 5s
- [ ] Dashboard shows internal route breakdown:
  ```
  POST /api/auth/login   →  234ms avg  ●  0 errors
  GET  /api/cards        →   45ms avg  ●  0 errors
  POST /api/cards        →  890ms avg  ▲  12% errors  ← FLAGGED
  ```

### Scenario Runner with Variable Chaining
- [ ] Run all APIs in order as a single user flow
- [ ] Variables extracted from step N automatically injected into step N+1
- [ ] Load test the whole scenario (e.g. 50 concurrent users doing full login → CRUD flow)
- [ ] Per-step timing breakdown in the report

---

## Phase 5 — AI Features

> **Goal:** Add intelligence on top of the data already being collected.  
> **Est. time:** 1–2 weeks (can be done incrementally)  
> **Package:** `@anthropic-ai/sdk` + Vercel `ai` SDK

### AI Performance Analyst
- [ ] After any test completes, "Analyse with AI" button appears in the report
- [ ] Sends full `AggregatedMetrics` + time series to Claude
- [ ] Streams back a narrative diagnosis:
  > *"Your p99 latency jumped from 180ms to 2.4s at stress level 4 (50 users). This pattern — stable p50 but collapsing p99 — is classic connection pool exhaustion. Consider increasing your DB pool size from the default 5 to 20–50."*
- [ ] Replaces and enhances the current rule-based `generateObservations()` in `metrics.ts`

### Natural Language Test Generator
- [ ] Text input: *"Simulate 500 users hitting my checkout API during a flash sale, ramping up over 2 minutes"*
- [ ] Claude parses it and fills the full test config form automatically
- [ ] Uses Claude tool-use / structured output → JSON config → auto-populate

### Real-time Anomaly Detection (No API cost — pure math)
- [ ] Sliding Z-score window on incoming latency during live tests
- [ ] When data point is >2.5 standard deviations from rolling mean → flash anomaly warning
- [ ] Runs inside the SSE stream handler — zero API calls, instant detection

### AI Regression Comparator
- [ ] Pick any two history entries → side-by-side diff
- [ ] AI explains the delta:
  > *"p95 regressed by 340ms (+42%) vs yesterday's baseline. Error pattern is identical, ruling out infra — likely a code-level regression."*

### OpenAPI → Scenario Generator
- [ ] Upload `swagger.json` / `openapi.yaml` → AI reads all endpoints + schemas
- [ ] Generates a realistic multi-step scenario with variable extraction chains
- [ ] Covers Phase 4 scenario builder automatically for documented APIs

### "Ask My Tests" — Natural Language History Query
- [ ] Chat input on the history panel
- [ ] *"Which endpoint was slowest last week?"* / *"Did the API get faster after Monday's deploy?"*
- [ ] AI writes the MongoDB aggregation query, runs it, explains the result

### Smart Load Profile Recommender
- [ ] Analyzes the URL + a quick HEAD request
- [ ] Auto-recommends test type and load config based on what it detects:
  - Static asset → Smoke test
  - Auth route → Rate limit test
  - CRUD API → Load test with suggested concurrency

### k6 / Artillery Script Exporter
- [ ] "Export as k6 script" → AI generates equivalent JavaScript
- [ ] "Export as Artillery YAML" → ready for CI/CD pipeline
- [ ] Makes tests portable outside this tool

---

## Phase 6 — Browser & Protocol Testing

> **Goal:** Cover non-HTTP protocols and real browser testing.  
> **Est. time:** 2–3 weeks

### Website / Browser Testing (Playwright)
- [ ] Add `@playwright/test` dependency
- [ ] New test type: "Website Test" — real Chromium browser
- [ ] Core Web Vitals: LCP, FID/INP, CLS, FCP, TTFB
- [ ] JavaScript error capture during page load
- [ ] Network waterfall — all sub-resources timed
- [ ] Screenshot on failure
- [ ] Mobile viewport simulation (375px, 768px, 1440px)
- [ ] Browser test API route: `/api/tests/[id]/browser`
- [ ] Results UI: Core Web Vitals cards + resource waterfall chart (`d3` flamegraph)

### WebSocket Testing
- [ ] Add `ws` package
- [ ] Connect, send messages, measure response latency
- [ ] Load test WebSocket connections (100+ concurrent connections)
- [ ] Message throughput metrics

### GraphQL Testing
- [ ] Add `graphql-request`
- [ ] Introspection — auto-discover all queries and mutations
- [ ] Load test specific queries with variables
- [ ] Mutation + query chaining (like scenario tests for REST)

### gRPC Testing
- [ ] Add `@grpc/grpc-js`
- [ ] Unary RPC benchmarking
- [ ] Server streaming + client streaming load tests

---

## Phase 7 — Infrastructure & Database Testing

> **Goal:** Go beyond HTTP — test the full stack.  
> **Est. time:** 2 weeks

### Database Adapters
- [ ] MongoDB query benchmarking (`mongodb` already installed)
- [ ] PostgreSQL query latency testing (`pg`)
- [ ] MySQL benchmarking (`mysql2`)
- [ ] Redis command latency (`ioredis`)
- [ ] Connection pool stress testing for all DB types

### Server Resource Correlation
- [ ] `systeminformation` — CPU %, memory, network I/O during tests
- [ ] Overlay CPU/memory on the live response time chart
- [ ] Detect: "Your p99 spikes exactly when CPU hits 90% — server is CPU-bound, not I/O-bound"

### Failure Injection
- [ ] Random request delays (chaos mode)
- [ ] Drop connections mid-request
- [ ] Inject artificial errors at a configurable rate
- [ ] Test how your app handles partial failures

---

## Phase 8 — CI/CD & Automation

> **Goal:** Run tests in pipelines without the UI.  
> **Est. time:** 1 week

### CLI Runner
- [ ] `npx api-perf-tester run perf.config.ts` — runs all APIs, outputs results to stdout
- [ ] Exit code 1 if any threshold is breached (p95 > X ms, error rate > Y%)
- [ ] GitHub Actions example workflow included in docs
- [ ] Output formats: JSON, JUnit XML (for CI test reporters)

### Threshold Alerts
- [ ] Define pass/fail thresholds in `perf.config.ts`:
  ```typescript
  thresholds: {
    p95: 500,        // fail if p95 > 500ms
    errorRate: 0.01, // fail if error rate > 1%
    successRate: 99, // fail if success rate < 99%
  }
  ```
- [ ] Test auto-fails in UI + CLI if any threshold breached
- [ ] Report shows which thresholds passed / failed

### Scheduled Tests
- [ ] `node-cron` — schedule any saved test config to run on a cron schedule
- [ ] E.g. run a smoke test every 5 minutes against prod
- [ ] Alert (webhook / email) if test fails thresholds
- [ ] Results stored in history automatically

### Test Comparison
- [ ] Baseline snapshot — mark any test result as "baseline"
- [ ] All future tests for same URL auto-compared against baseline
- [ ] Dashboard shows: `↑ 12% faster` / `↓ 34% slower` vs baseline
- [ ] AI explains why regression happened

---

## Packages to Install (Full List)

```bash
# Phase 2 — UI & State
npm install zustand @tanstack/react-query @tanstack/react-virtual @tanstack/react-table
npm install framer-motion react-resizable-panels jspdf html2canvas xlsx

# Phase 5 — AI
npm install @anthropic-ai/sdk ai

# Phase 6 — Protocols
npm install @playwright/test ws graphql-request @grpc/grpc-js

# Phase 7 — Infrastructure
npm install systeminformation pg mysql2 ioredis

# Phase 8 — CLI & Scheduling
npm install node-cron
```

---

## Priority Order — What to Build First

| # | Phase | Feature | Impact | Time |
|---|-------|---------|--------|------|
| 1 | 2 | Virtual terminal (stop freezing) | Stability fix | 2–3 hrs |
| 2 | 2 | zustand refactor (clean up page.tsx) | DX | 1 day |
| 3 | 2 | Local Dev Mode toggle (persistent) | Unblocks local testing | 2 hrs |
| 4 | 3 | Project registry + health monitor | Multi-project hub | 1.5 days |
| 5 | 3 | Live projects dashboard grid | Central view | 1 day |
| 6 | 4 | `perf.sdk.ts` — one-line setup | Core new feature | 2 days |
| 7 | 4 | `perf.config.ts` schema + auto-discovery | Core new feature | 1.5 days |
| 8 | 4 | Scenario runner + variable chaining | Real-user flows | 2 days |
| 9 | 5 | AI Performance Analyst (streaming) | WOW factor | 1.5 days |
| 10 | 5 | Anomaly detection (Z-score, no API cost) | Live intelligence | 1 day |
| 11 | 5 | NL Test Generator | Ease of use | 2 days |
| 12 | 6 | Playwright browser + Core Web Vitals | Feature gap | 4–5 days |
| 13 | 8 | CLI runner + thresholds | CI/CD integration | 2–3 days |
| 14 | 8 | Scheduled tests (cron) | Automation | 1 day |

**Quick wins (Phase 2 only): ~3 days → tool is stable and polished**  
**Full SDK integration (Phase 4): ~1 week → connects all your apps**  
**AI features (Phase 5): ~1 week → intelligent analysis on top**  
**Everything: ~6–8 weeks**
