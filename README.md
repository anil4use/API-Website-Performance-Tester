# 🚀 API Performance Tester (`api-perf-tester`)

> **High-Performance Local API & Website Stress, Load, and Reliability Testing Platform**  
> Built with Next.js 14 App Router, TypeScript, Tailwind CSS, MongoDB, and multi-threaded Node.js `worker_threads`.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Design](#architecture--design)
- [Supported Test Types](#supported-test-types)
- [Extreme-Scale Breakpoint Testing & Distributed Fleet](#-extreme-scale-breakpoint-testing--distributed-fleet)
- [Rate Limit Bypass & Evasion Engine](#rate-limit-bypass--evasion-engine)
- [Dynamic Variable Generators](#dynamic-variable-generators)
- [Safety & SSRF Protection](#safety--ssrf-protection)
- [Reports, Metrics & Exporting](#reports-metrics--exporting)
- [Tech Stack](#tech-stack)
- [Project Directory Structure](#project-directory-structure)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Roadmap & Vision](#roadmap--vision)

---

## 🌟 Overview

**API Performance Tester** is a local, developer-first performance engineering workbench. It eliminates the friction of configuring heavyweight external tools (like k6, JMeter, or Locust) for routine API benchmarking, stress testing, and rate-limit discovery.

With an interactive browser dashboard running on **port 4004**, users can fire single diagnostic requests, run stepped stress tests with hundreds of concurrent virtual users, simulate traffic spikes, and bypass upstream rate limiters—all while streaming sub-second metrics and request logs in real time via Server-Sent Events (SSE).

---

## ⚡ Key Features

- **7 Comprehensive Testing Modes**: Single Request, Load Test, Stress Test, Spike Test, Endurance / Soak Test, Rate Limit Test, and **Extreme-Scale Breakpoint / Burst Test**.
- **Distributed Load Generation**: Scale beyond single-node OS socket limits (20k–80k RPS) by attaching standalone remote load agent processes across multiple machines over a dedicated WebSocket control channel (`port 4005`).
- **Dedicated Multi-Threaded Engine**: Tests execute inside isolated Node.js `worker_threads` (`load-worker.js`), ensuring that heavy socket activity never blocks the Next.js UI or API server event loop.
- **Uncapped Socket Throughput**: Custom `http.Agent` and `https.Agent` configurations with `maxSockets: Infinity` bypass Node.js's default connection bottlenecks for true concurrent traffic generation.
- **Real-Time Split Dashboard (50 / 50 Layout)**:
  - **Left**: Live scrolling terminal showing timestamped HTTP status codes, latencies, response byte sizes, body snippets, and error traces.
  - **Right**: Real-time aggregated metric cards and 4 dynamic Recharts graphs (Throughput RPS, Response Time percentiles, Error Rate, and Virtual User Concurrency).
- **In-Flight Test Controls**: Pause, Resume, or Abort load tests instantly at any point during execution.
- **Rate-Limit Bypass & Evasion Toolkit**: IP spoofing/rotation (`X-Forwarded-For`, `CF-Connecting-IP`, etc.), User-Agent cycling, secret bypass headers with dynamic crypto tokens, per-slot pacing delays, and automatic HTTP 429 retries with `Retry-After` parsing.
- **Enterprise-Grade SSRF & Target Safety Protection**: Built-in detection for cloud metadata services (AWS/GCP/Alibaba), private IP blocks (RFC 1918), loopback interfaces, and dangerous URL protocols, complemented by a legal confirmation modal and an opt-in Local Dev toggle.
- **Dynamic Variable Generators**: Postman-style handlebars syntax (e.g., `{{uuid}}`, `{{randomEmail}}`, `{{randomName}}`) to simulate diverse realistic payloads without hardcoded data.
- **Analytical Reports & Auto-Observations**: Automated heuristic analysis of tail latencies ($p_{90}, p_{95}, p_{99}, p_{99.9}$), server bottlenecks (5xx), timeouts, and throughput thresholds.
- **Multi-Format Export**: Export completed test reports to standalone **HTML** (with self-contained styling), **CSV** (for spreadsheets), or raw **JSON**.
- **MongoDB Test History & Comparison**: Automatically saves completed test runs with configuration snapshots, aggregated metrics, and side-by-side comparison between runs.
- **Shareable URL State**: Entire test configurations are serialized into Base64 URL parameters (`?cfg=...`) with debounced auto-syncing, enabling one-click test sharing among team members.

---

## 🏗️ Architecture & Design

### High-Level System Architecture

```mermaid
flowchart TD
    subgraph Browser ["Client Dashboard (Next.js App Router - Port 4004)"]
        UI["Main UI & State\n(src/app/page.tsx)"]
        Terminal["LiveTerminal\n(Streaming Logs)"]
        Charts["MetricCharts & LiveMetrics\n(Recharts)"]
        Report["TestReportView &\nSingleRequestResult"]
        Config["Target, Request, Load,\nBreakpoint & Bypass Sections"]
    end

    subgraph Server ["Next.js Server & Orchestrator (Port 4004)"]
        API_Req["/api/request\n(Single Diagnostic)"]
        API_Tests["/api/tests & /api/tests/[id]/*\n(Start / Stop / Control / Stream)"]
        API_Agents["/api/agents & /api/agents/calibrate\n(Cluster Fleet & Empirical Calibrator)"]
        Safety["Safety Validator\n(src/lib/safety.ts)"]
        Orchestrator["TestOrchestrator Singleton\n(src/lib/engine/orchestrator.ts)"]
        LoadSplitter["Load Splitter Engine\n(src/lib/engine/load-splitter.ts)"]
    end

    subgraph WS_Server ["Distributed Fleet Coordinator (Port 4005)"]
        AgentRegistry["AgentRegistry WebSocket Server\n(ws://localhost:4005)"]
    end

    subgraph Local_Engine ["Local Worker Thread Layer"]
        Worker["load-worker.js\n(worker_threads)"]
        Agent["http.Agent / https.Agent\n(maxSockets: Infinity)"]
    end

    subgraph Distributed_Fleet ["Remote Agent Fleet (N Machines / Containers)"]
        Remote1["Remote Agent 1\n(node src/workers/remote-agent.js)"]
        Remote2["Remote Agent 2\n(node src/workers/remote-agent.js)"]
    end

    subgraph Storage ["Database"]
        Mongo[("MongoDB: test_history\n(Snapshots & Aggregates)")]
    end

    subgraph Target ["Target Under Test"]
        TargetAPI["Target Web Service / API\n(HTTP / HTTPS)"]
    end

    Config --> UI
    UI -->|POST /api/tests/[id]/start| API_Tests
    UI -->|POST /api/request| API_Req
    UI -->|GET/POST /api/agents| API_Agents
    API_Req --> Safety
    API_Req --> TargetAPI
    API_Tests --> Safety
    API_Tests --> Orchestrator

    Orchestrator --> LoadSplitter
    LoadSplitter -->|Local Slice| Worker
    LoadSplitter -->|Remote Slices| AgentRegistry
    AgentRegistry -->|WebSocket assign_load| Remote1
    AgentRegistry -->|WebSocket assign_load| Remote2

    Worker --> Agent
    Agent -->|Burst Traffic| TargetAPI
    Remote1 -->|Burst Traffic| TargetAPI
    Remote2 -->|Burst Traffic| TargetAPI

    Remote1 -->|WS metrics_batch| AgentRegistry
    Remote2 -->|WS metrics_batch| AgentRegistry
    AgentRegistry -->|Aggregated Agent Metrics| Orchestrator
    Worker -->|postMessage metrics & logs| Orchestrator

    Orchestrator -->|SSE: /api/tests/[id]/stream| UI
    UI --> Terminal
    UI --> Charts
    UI --> Report

    Orchestrator -->|Persist Test Report| Mongo
    UI -->|Fetch History & Compare| Mongo
```

### Execution Flow

1. **Configuration & Preset Selection**: The user selects a test mode or one of 6 realistic scenario presets (e.g. *Flash Sale Spike*, *Viral Social Post*), configuring target VUs, RPS, ramp strategy, and abort thresholds.
2. **Safety & Hostname Confirmation**: `checkUrlSafety()` verifies the URL against private subnet patterns and cloud metadata IP ranges. For Breakpoint mode, the safety modal demands explicit typing of the target hostname to prevent catastrophic accidental denial-of-service.
3. **Pre-Flight Capacity Check**: The orchestrator checks whether the configured RPS is achievable given single-node empirical calibration or connected remote agents. Users can fire a 2-second pre-flight calibration burst to measure node headroom.
4. **Load Splitting & Dispatch**: `load-splitter.ts` divides virtual users and target RPS across the local worker pool and all authenticated remote load agents connected via WebSocket on port 4005.
5. **Real-time SSE Streaming & Sub-Second Abort Monitoring**: Workers and remote agents stream metrics every 250–500ms. If error rate, $p_{99}$ latency, or consecutive timeouts breach abort thresholds, the orchestrator immediately halts all traffic and drains in-flight requests.
6. **Honesty Check & Bottleneck Diagnosis**: The final report compares configured target vs. actually achieved RPS, flags bottlenecks (connection timeouts vs. 5xx vs. 429), records the breaking point marker, and computes post-burst recovery time.

---

## 🎯 Supported Test Types

| Test Type | Description | Key Configuration Parameters |
|:---|:---|:---|
| **Single Request** | Runs a single diagnostic request to inspect the HTTP handshake, detailed timings (DNS, TCP, TLS, TTFB, transfer), headers, and formatted response body. | Timeout, Redirect following, Custom headers, Auth. |
| **Load Test** | Simulates steady virtual user traffic over a fixed duration or total request volume, with optional ramp-up and ramp-down periods. | Concurrency, Total Requests, Duration (s), Ramp-Up (s), Ramp-Down (s), Target RPS. |
| **Stress Test** | Progressively escalates concurrency across stepped tiers (e.g. $10 \to 25 \to 50 \to 100 \to 250 \to 500$ users) to locate system breaking points. | Concurrency Levels array, Level Duration (s), Ramp duration between levels. |
| **Spike Test** | Simulates baseline normal traffic, injects an abrupt massive traffic burst, and returns to baseline to measure system resilience and recovery time. | Normal Users, Spike Users, Normal Duration (s), Spike Duration (s), Recovery Duration (s). |
| **Endurance / Soak** | Applies sustained load over long periods (minutes to hours) to identify slow memory leaks, database connection pool exhaustion, or socket degradation. | Concurrency, Duration (s), Target RPS. |
| **Rate Limit Test** | Sends rapid bursts of requests to probe an endpoint's rate-limiting algorithms and observe exact HTTP 429 thresholds. | Total Requests, Concurrency, Burst Mode. |
| **Breakpoint / Extreme Burst** | Pushes targets to their breaking point under massive burst scenarios (e.g. 100k users, 1M RPS) using distributed load generation across worker clusters. | Target Virtual Users, Target RPS, Burst Duration (1-60s), Ramp Strategy (`instant`, `ramp_100ms`, `ramp_1s`), Distributed Nodes, Auto-Abort Conditions. |

---

## 🔥 Extreme-Scale Breakpoint Testing & Distributed Fleet

### Why Distributed Load Generation is Required
A single Node.js process cannot generate 1,000,000 requests/second on its own—OS socket descriptor limits, NIC throughput, and event loop context switching cap a single high-spec machine at roughly 20k–80k req/s. Achieving realistic "100k users / 1M RPS" scale requires coordinating multiple load-generating worker machines.

### Distributed Architecture
- **Orchestrator & WebSocket Control Channel**: Runs on `ws://localhost:4005` with cluster security tokens (`brk_<hex>`).
- **Remote Load Agent (`src/workers/remote-agent.js`)**: Standalone Node.js process deployable on any machine, container, or VM:
  ```bash
  node src/workers/remote-agent.js --orchestrator=ws://<orchestrator-host>:4005 --token=<cluster_token> --name=node-east-1
  ```
- **Load Splitter (`src/lib/engine/load-splitter.ts`)**: Distributes virtual users and target RPS across local workers and all active remote agents, monitoring fleet capacity and health heartbeats.
- **Unified Live Telemetry**: Metrics from all agents are aggregated in real time and displayed alongside individual per-node throughput cards.

### Realistic Scenario Presets

| Preset Name | Simulates | Virtual Users | Target RPS | Duration | Ramp Strategy |
|:---|:---|:---|:---|:---|:---|
| **Flash Sale Spike** | E-commerce drop / sneaker flash sale | 50,000 | 200,000 | 10s | Instant |
| **Viral Social Post** | Traffic surge from a viral post or tweet | 100,000 | 1,000,000 | 5s | Ramp 1s |
| **DDoS-Style Burst** | Worst-case malicious bot traffic burst (for rate-limit resilience) | 200,000 | 2,000,000 | 3s | Instant |
| **Marketing Email Blast** | Scheduled newsletter click wave | 20,000 | 50,000 | 60s | Ramp 1s |
| **Breaking News Mention** | Sudden organic news surge | 30,000 | 100,000 | 30s | Ramp 100ms |
| **Gradual Capacity Discovery**| Discovery test finding true API breaking point ceiling | 10,000 | 100,000 | 30s | Stepped Ramp |

### Pre-Flight Capacity Checks & Empirical Calibration
- **2-Second Calibration Burst**: Click **"Run 2s Calibration"** to fire an empirical probe against the target to measure single-node capability.
- **Fleet Feasibility Warning**: If configured RPS exceeds the total capacity of connected nodes, the UI automatically warns the tester and recommends either attaching more agents or adjusting targets.

### Safety Guardrails & Sub-Second Auto-Abort
- **Sub-Second Monitoring (250ms)**: Evaluates rolling error rate, $p_{99}$ latency, and consecutive timeouts every 250ms during the burst.
- **Graceful Drain**: If an abort threshold is tripped, request generation stops instantly while allowing in-flight sockets to drain for up to 3 seconds to avoid report corruption.
- **Strict Hostname Confirmation**: Safety modal requires typing the exact target hostname before executing any Breakpoint test.

### Advanced Reporting & Diagnosis
- **Breaking Point Marker**: Records the exact timestamp, RPS, error rate, and $p_{99}$ latency at the moment of failure.
- **Test-Rig Honesty Check**: Flags when achieved RPS was below configured targets, clearly diagnosing whether the bottleneck was the target server or insufficient test-rig agents.
- **Bottleneck Diagnosis Heuristic**:
  - *Connection timeouts / Refused*: Target TCP backlog / OS socket exhaustion.
  - *HTTP 5xx responses*: Application collapse (database pool exhaustion, out-of-memory).
  - *HTTP 429 responses*: Upstream WAF / rate limiter active as intended.
- **Post-Burst Recovery Time**: Measures how many seconds elapsed after the burst ended before latency normalized.

---

## 🛡️ Rate Limit Bypass & Evasion Engine

When testing protected or rate-limited endpoints, the built-in bypass toolkit (`src/components/BypassSection.tsx` & `src/workers/load-worker.js`) allows authorized testers to evaluate application behavior without being blocked by upstream proxies:

1. **IP Rotation & Spoofing**:
   - Random public IPv4 addresses (excluding reserved ranges) are injected into upstream proxy headers on every request:
     - `X-Forwarded-For`
     - `X-Real-IP`
     - `X-Client-IP`
     - `CF-Connecting-IP` (Cloudflare)
     - `True-Client-IP` (Akamai / Cloudflare)
2. **User-Agent Randomization**:
   - Rotates through a curated pool of modern browser signatures (Chrome, Firefox, Safari on Windows, macOS, Linux, iOS, and Android) and HTTP client libraries (Postman, Axios, HTTPX, Go-http-client).
3. **Secret Bypass Headers**:
   - Transmits custom verification headers (e.g., `X-Load-Test-Key`).
   - Supports static secrets or dynamic cryptographic token generation per request (`lte_<hex>`).
4. **Adaptive 429 Retry & Backoff**:
   - Automatically catches HTTP 429 responses, extracts the server's `Retry-After` header value (in seconds), and pauses before retrying (up to 3 attempts).
5. **Request Pacing & Global RPS Throttling**:
   - Slot-level delay (`requestDelay`) for inter-request pacing.
   - Global token-bucket rate limiter (`maxRps`) across all worker slots to maintain precise overall throughput.
6. **In-Flight Detection**:
   - If HTTP 429 responses are detected during a live test, the dashboard presents a one-click banner to enable IP rotation immediately.

---

## 🎲 Dynamic Variable Generators

The test engine supports inline variable interpolation in request bodies, query strings, and headers using `{{variable}}` syntax:

| Generator Variable | Output Description | Example Output |
|:---|:---|:---|
| `{{uuid}}` / `{{randomUUID}}` | RFC 4122 Version 4 UUID | `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d` |
| `{{randomString}}` | 16-character hexadecimal string | `a3f9b12c4d8e7f01` |
| `{{randomEmail}}` | Realistic user email address | `alice.smith42@example.com` |
| `{{randomNumber}}` / `{{randomInt}}` | Random integer between 0 and 999,999 | `482931` |
| `{{randomName}}` | Random full name (First + Last) | `Alice Smith` |
| `{{randomFirstName}}` | Random first name | `Alice` |
| `{{randomLastName}}` | Random last name | `Smith` |
| `{{randomPhone}}` | US formatted phone number | `+11234567890` |
| `{{randomDate}}` | ISO 8601 UTC date string | `2023-07-15T14:22:31.000Z` |
| `{{randomFloat}}` | Decimal value with 2 decimal places | `384.71` |
| `{{randomBoolean}}` | Boolean string (`true` or `false`) | `true` |
| `{{timestamp}}` | Current Unix epoch timestamp in milliseconds | `1728729600000` |
| `{{randomWord}}` | Phonetic / NATO dictionary word | `gamma` |

---

## 🔒 Safety & SSRF Protection

To prevent accidental abuse and protect internal infrastructure, the platform enforces strict safety layers:

- **Protocol Whitelist**: Only `http:` and `https:` schemes are permitted. Schemes such as `file:`, `ftp:`, `gopher:`, `dict:`, `ldap:`, and `ldaps:` are rejected.
- **Cloud Metadata Blocking**: Requests to `169.254.169.254` (AWS/GCP), `169.254.170.2` (ECS), `metadata.google.internal`, and `100.100.100.200` (Alibaba) are blocked.
- **Private Subnet Filter**: Loopback (`127.0.0.0/8`, `::1`), Class A (`10.0.0.0/8`), Class B (`172.16.0.0/12`), Class C (`192.168.0.0/16`), Carrier-Grade NAT (`100.64.0.0/10`), and IPv6 private (`fc00::/7`, `fe80::/10`) are blocked by default.
- **Local Dev Mode Toggle**: Developers testing their own local services (e.g. `localhost:3000`) can explicitly enable **"Allow Local / Internal Testing"** under Advanced Options.
- **Safety Confirmation Modal**: A confirmation dialog requires the user to acknowledge legal authorization before any multi-request load test can be triggered.

---

## 📊 Reports, Metrics & Exporting

### Latency Percentiles
The analytics engine calculates precise percentiles across all completed requests:
- Minimum, Average, and Maximum
- $p_{50}$ (Median)
- $p_{75}$
- $p_{90}$
- $p_{95}$
- $p_{99}$
- $p_{99.9}$

### Automated Observations
Rule-based analysis highlights:
- Overall success and failure rates.
- Average latency and tail latency anomalies ($p_{95} > 1000\text{ms}$, $p_{99} > 2000\text{ms}$ or $5000\text{ms}$).
- Proportions of HTTP 429 rate limits, HTTP 5xx internal server errors, and socket timeouts.
- Test-specific context (e.g. stress test breaking points, spike recovery responsiveness).

### Export Options
- **JSON**: Complete machine-readable data payload including full test configuration, raw percentiles, status counts, and the 120-point rolling time series.
- **CSV**: Structured spreadsheet summary with request statistics, latency distribution, error breakdown, and time-series history.
- **HTML**: Standalone, responsive, dark-mode report that can be opened in any browser without external dependencies.

---

## 💻 Tech Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| **Framework** | Next.js 14.2 (App Router) | Full-stack React framework with server routes |
| **Runtime** | Node.js (with `worker_threads`) | High-concurrency background execution engine |
| **Language** | TypeScript 5 | End-to-end type safety |
| **UI Styling** | Tailwind CSS 3.4 & PostCSS | Responsive dark-mode styling |
| **Charts** | Recharts 2.12 | Real-time area, line, and bar charts |
| **Icons** | Lucide React | Modern UI iconography |
| **Database** | MongoDB Native Driver 6.7 | Test run persistence and historical analysis |
| **Date Utilities** | Date-fns 3.6 | Timestamp formatting and elapsed duration calculations |

---

## 📁 Project Directory Structure

```
d:\CODE\testing-web\
├── .env.local                    # Local environment variables (MongoDB URI & DB name)
├── next.config.mjs               # Next.js build and runtime configuration
├── package.json                  # Dependencies and scripts (runs on port 4004)
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript compiler configuration
├── ROADMAP.md                    # Multi-phase development roadmap (Phases 1–8)
│
└── src/
    ├── app/
    │   ├── layout.tsx            # Root HTML layout with dark theme
    │   ├── globals.css           # Custom scrollbars, animations, and color tokens
    │   ├── page.tsx              # Main dashboard: state management, SSE client & layout
    │   └── api/
    │       ├── request/
    │       │   └── route.ts      # POST: Single request execution with timing breakdown
    │       ├── tests/
    │       │   ├── route.ts      # GET: List historical test runs with pagination
    │       │   └── [id]/
    │       │       ├── route.ts  # GET: Check active test or fetch historical record; DELETE: Remove entry
    │       │       ├── start/
    │       │       │   └── route.ts   # POST: Initialize and spawn worker for a test run
    │       │       ├── stop/
    │       │       │   └── route.ts   # POST: Terminate an active test run
    │       │       ├── control/
    │       │       │   └── route.ts   # POST: Pause or resume an active test
    │       │       ├── stream/
    │       │       │   └── route.ts   # GET: SSE endpoint streaming live metrics & terminal logs
    │       │       ├── report/
    │       │       │   └── route.ts   # GET: Retrieve completed test report
    │       │       └── export/
    │       │           └── route.ts   # GET: Download report as JSON, CSV, or HTML
    │       ├── agents/
    │       │   ├── route.ts       # GET/POST: Cluster token management, connected agent status
    │       │   └── calibrate/
    │       │       └── route.ts   # POST: 2-second empirical single-node capacity burst probe
    │       └── projects/
    │           └── [id]/run-suite/ # (Roadmap stub for Phase 3 Multi-Project Hub)
    │
    ├── components/
    │   ├── TargetSection.tsx       # URL input, protocol validation, and test naming
    │   ├── RequestSection.tsx      # HTTP methods, headers, query params, auth & body editors
    │   ├── TestTypeSection.tsx     # Selector grid for 7 test modes (including Breakpoint)
    │   ├── LoadSection.tsx         # Config forms for Load, Stress, Spike, Endurance & Rate Limit
    │   ├── BreakpointSection.tsx   # Breakpoint test config, 6 presets, calibration & remote agent fleet drawer
    │   ├── BypassSection.tsx       # Rate limit bypass options (IPs, User-Agents, headers, pacing)
    │   ├── LiveTerminal.tsx        # Terminal emulator with streaming logs & status coloring
    │   ├── LiveMetrics.tsx         # Status banner, breaking-point alert banner, and latency counters
    │   ├── MetricCharts.tsx        # 4 live Recharts (Throughput, Latency, Errors, Concurrency)
    │   ├── TestReportView.tsx      # Summary, breaking point marker, honesty check & bottleneck diagnosis
    │   ├── SingleRequestResult.tsx # Single request response inspection & timing breakdown
    │   ├── HistoryPanel.tsx        # Drawer panel for historical test runs & side-by-side comparison
    │   └── SafetyModal.tsx         # Safety authorization confirmation modal with typed hostname guard
    │
    ├── lib/
    │   ├── db.ts                   # MongoDB connection management, indexing, and CRUD operations
    │   ├── generators.ts           # Dynamic variable replacement engine (14+ generators)
    │   ├── metrics.ts              # Percentile math, time-series aggregation, and heuristics
    │   ├── safety.ts               # SSRF check, RFC 1918 filter, header and query builder
    │   ├── single-request.ts       # Low-level http/https execution with socket timing hooks
    │   ├── types.ts                # TypeScript interfaces and enum definitions
    │   ├── utils.ts                # Formatting helpers (ms, bytes, RPS, numbers, class merging)
    │   └── engine/
    │       ├── orchestrator.ts     # Process singleton managing active test runs & worker threads
    │       ├── agent-registry.ts   # WebSocket control server (port 4005) managing remote agents & token auth
    │       └── load-splitter.ts    # Load distribution engine dividing VUs/RPS across cluster nodes
    │
    └── workers/
        ├── load-worker.js          # Multi-threaded worker: socket agents, loops, 250ms abort monitor
        ├── remote-agent.js         # Standalone remote worker script for distributed load generation
        ├── load-worker.ts          # TypeScript reference implementation
        └── worker-shim.js          # Module resolution shim for worker threads
```

---

## 📡 API Reference

### 1. Execute Single Request
- **Endpoint**: `POST /api/request`
- **Body**:
  ```json
  {
    "url": "https://api.example.com/v1/users",
    "config": {
      "method": "POST",
      "headers": { "Content-Type": "application/json" },
      "queryParams": { "limit": "10" },
      "body": "{\"name\": \"{{randomName}}\", \"email\": \"{{randomEmail}}\"}",
      "contentType": "application/json",
      "auth": { "type": "bearer", "token": "ey..." },
      "cookies": {},
      "timeout": 15000,
      "followRedirects": true
    },
    "allowLocal": false
  }
  ```
- **Response**: Returns timing metrics (`dnsTime`, `tcpTime`, `tlsTime`, `ttfb`, `totalTime`), status code, response body, and headers.

---

### 2. Start a Test Run
- **Endpoint**: `POST /api/tests/:id/start`
- **Body**: Complete `TestConfig` object specifying the test type, target, request settings, and load profile.
- **Response**: `{ "run": { "id": "...", "status": "running", "startedAt": 1728729600000 }, "testId": "..." }`

---

### 3. Stream Live Metrics & Logs (SSE)
- **Endpoint**: `GET /api/tests/:id/stream`
- **Headers**: `Accept: text/event-stream`
- **Event Data Stream**:
  ```json
  {
    "type": "metrics",
    "status": "running",
    "data": {
      "totalRequests": 1250,
      "successfulRequests": 1240,
      "failedRequests": 10,
      "requestsPerSecond": 142.5,
      "currentConcurrency": 25,
      "avgResponseTime": 84,
      "p50": 62,
      "p95": 148,
      "p99": 280,
      "status2xx": 1240,
      "status429": 0,
      "status5xx": 10,
      "timeSeries": [...]
    },
    "logs": [
      { "ts": 1728729601200, "s": 200, "l": 58, "e": null, "sz": 1420, "bs": "{\"status\":\"ok\"}" }
    ]
  }
  ```

---

### 4. Control Test Run
- **Endpoint**: `POST /api/tests/:id/control`
- **Body**: `{ "action": "pause" }` or `{ "action": "resume" }`

---

### 5. Stop Test Run
- **Endpoint**: `POST /api/tests/:id/stop`
- **Response**: `{ "stopped": true }`

---

### 6. Get Report & History
- **Get Report**: `GET /api/tests/:id/report`
- **Export Report**: `GET /api/tests/:id/export?format=json|csv|html`
- **List History**: `GET /api/tests?limit=50&offset=0`
- **Delete Record**: `DELETE /api/tests/:id`

---

### 7. Remote Agent Fleet Management
- **Cluster Status & Connected Agents**: `GET /api/agents`
  - Response: `{ "token": "brk_...", "totalAgents": 2, "connectedAgents": [...], "singleNodeEstimatedRps": 50000, "totalClusterEstimatedRps": 150000 }`
- **Rotate Cluster Token**: `POST /api/agents` with body `{ "action": "rotate_token" }`
- **Update Calibrated Baseline RPS**: `POST /api/agents` with body `{ "calibratedRps": 75000 }`

---

### 8. Empirical Capacity Calibration
- **Endpoint**: `POST /api/agents/calibrate`
- **Body**: `{ "targetUrl": "https://api.example.com/health", "allowLocal": false }`
- **Behavior**: Fires a 2-second empirical `HEAD` request burst against the target to measure single-node achievable throughput and update cluster capacity estimates.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.17.0 or higher (v20+ recommended).
- **MongoDB**: A running instance (local MongoDB server or MongoDB Atlas).

### Installation

1. **Clone or navigate to the repository**:
   ```bash
   cd d:\CODE\testing-web
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```

3. **Verify or create environment configuration** (`.env.local`):
   ```env
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB=api_perf_tester
   ```

4. **Launch the development server**:
   ```bash
   npm run dev
   ```

5. **Open the browser**:
   Navigate to [http://localhost:4004](http://localhost:4004).

---

## ⚙️ Environment Configuration

| Variable | Default Value | Description |
|:---|:---|:---|
| `MONGODB_URI` | `mongodb://localhost:27017` | Connection string for MongoDB database |
| `MONGODB_DB` | `api_perf_tester` | Database name for persisting test runs and snapshots |
| `PORT` | `4004` | Application HTTP server port (configured in `package.json`) |

---

## 🗺️ Roadmap & Vision

The project roadmap is structured into 8 distinct evolution phases (see [`ROADMAP.md`](./ROADMAP.md) for complete details):

- [x] **Phase 1: Core Engine (Complete)**: Next.js 14 App Router, `worker_threads` load engine, 6 test modes, SSE live streaming, MongoDB history, Recharts dashboard, rate limit bypass toolkit, and multi-format exports.
- [ ] **Phase 2: UI Stability & Developer Experience**: Global Zustand state refactor, `@tanstack/react-virtual` terminal to handle 100,000+ log lines smoothly, `react-resizable-panels`, and persistent dev mode toggles.
- [ ] **Phase 3: Multi-Project Hub**: Centralized registry for all your local/remote microservices, background 30s health pings, uptime tracking, and single-click smoke testing.
- [ ] **Phase 4: SDK Integration (`perf.sdk.ts`)**: Single-file drop-in for Express/Fastify/NestJS to auto-register routes, ping health, and stream internal route latencies.
- [ ] **Phase 5: AI Performance Analyst**: Claude-powered post-test narrative diagnosis, real-time rolling Z-score anomaly detection, natural language test generators, and OpenAPI-to-scenario generation.
- [ ] **Phase 6: Browser & Protocol Testing**: Playwright headless browser integration for Core Web Vitals (LCP, FID/INP, CLS), WebSocket load testing, GraphQL query benchmarking, and gRPC unary/streaming testing.
- [ ] **Phase 7: Infrastructure & Database Testing**: Direct connection pool stress tests for PostgreSQL, MySQL, Redis, and MongoDB, correlated with host CPU and memory usage (`systeminformation`).
- [ ] **Phase 8: CI/CD & Automation**: Headless CLI runner (`npx api-perf-tester run perf.config.ts`), threshold assertions (e.g. fail if $p_{95} > 500\text{ms}$), scheduled cron runs, and automated regression tracking.

---

## 📄 License

Private & Local Development Tool. Designed for authorized testing of personal, staging, and production environments.
