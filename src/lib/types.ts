// ─── Enums ───────────────────────────────────────────────────────────────────

export type TestType =
  | 'single'
  | 'load'
  | 'stress'
  | 'spike'
  | 'endurance'
  | 'rate-limit'
  | 'website'
  | 'scenario'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type AuthType = 'none' | 'bearer' | 'basic' | 'api-key'
export type ContentType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'text/plain'
  | 'text/xml'
  | 'application/xml'
  | 'none'

export type TestStatus = 'pending' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface AuthConfig {
  type: AuthType
  token?: string
  username?: string
  password?: string
  apiKey?: string
  apiKeyHeader?: string
}

export interface RequestConfig {
  method: HttpMethod
  headers: Record<string, string>
  queryParams: Record<string, string>
  body?: string
  contentType: ContentType
  auth: AuthConfig
  cookies: Record<string, string>
  timeout: number // ms
  followRedirects: boolean
}

export interface LoadConfig {
  concurrency: number
  totalRequests?: number
  duration?: number      // seconds
  rampUpTime?: number    // seconds
  rampDownTime?: number  // seconds
  requestsPerSecond?: number
}

export interface StressConfig {
  levels: number[]           // concurrency levels, e.g. [10, 25, 50, 100, 250, 500]
  levelDuration: number      // seconds per level
  rampBetweenLevels: number  // seconds to ramp between levels
}

export interface SpikeConfig {
  normalUsers: number
  spikeUsers: number
  normalDuration: number  // seconds before spike
  spikeDuration: number   // seconds of spike
  recoveryDuration: number // seconds after spike
}

export interface EnduranceConfig {
  concurrency: number
  duration: number  // seconds (e.g. 3600 = 1 hour)
  requestsPerSecond?: number
}

export interface RateLimitConfig {
  totalRequests: number
  concurrency: number
  burstMode: boolean
}

export interface ScenarioStep {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: string
  contentType: ContentType
  auth: AuthConfig
  extractors: Extractor[]
  assertions: Assertion[]
  delayMs?: number
}

export interface Extractor {
  id: string
  variableName: string
  source: 'body_json' | 'body_regex' | 'header' | 'status'
  expression: string
}

export interface Assertion {
  id: string
  type: 'status' | 'body_contains' | 'response_time' | 'header_exists'
  expected: string | number
}

export interface ScenarioConfig {
  steps: ScenarioStep[]
  iterations: number
  concurrentVirtualUsers: number
  variables: Record<string, string>
}

export interface BypassOptions {
  rotateIp: boolean             // Rotate X-Forwarded-For header (fools IP-based rate limiters)
  rotateUserAgent: boolean      // Rotate User-Agent per request
  bypassHeader: boolean         // Send a custom secret header your server can check
  bypassHeaderName: string      // e.g. "X-Load-Test-Key"
  bypassHeaderValue: string     // e.g. "mySecret123"
  rotateHeaderValue: boolean    // Generate a new random header value on every request
  requestDelay: number          // ms delay between requests per slot (pacing)
  retryOn429: boolean           // auto-retry when rate limited (429)
  retryDelay: number            // ms to wait before retrying a 429
  maxRps: number                // global max requests/sec across all slots (0 = unlimited)
}

export interface TestConfig {
  id: string
  name: string
  type: TestType
  target: string
  request: RequestConfig
  load?: LoadConfig
  stress?: StressConfig
  spike?: SpikeConfig
  endurance?: EnduranceConfig
  rateLimit?: RateLimitConfig
  scenario?: ScenarioConfig
  bypass?: BypassOptions
  authorizedByUser: boolean
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface RequestResult {
  timestamp: number
  statusCode: number
  responseTime: number   // ms
  dnsTime?: number       // ms
  tcpTime?: number       // ms
  tlsTime?: number       // ms
  ttfb?: number          // ms
  responseSize: number   // bytes
  error?: string
  isTimeout: boolean
  isConnectionFailure: boolean
}

export interface TimeSeriesPoint {
  timestamp: number
  requestsPerSecond: number
  avgResponseTime: number
  errorRate: number
  concurrency: number
  p95: number
  p99: number
  status2xx: number
  status4xx: number
  status5xx: number
  status429: number
}

export interface AggregatedMetrics {
  testId: string
  timestamp: number
  elapsed: number  // ms
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  requestsPerSecond: number
  currentConcurrency: number
  avgResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
  p999: number
  status2xx: number
  status3xx: number
  status4xx: number
  status5xx: number
  status429: number
  timeouts: number
  connectionFailures: number
  rateLimitedRequests: number
  errorRate: number
  errors: string[]
  timeSeries: TimeSeriesPoint[]
  stressLevel?: number
}

// ─── Single Request ───────────────────────────────────────────────────────────

export interface SingleRequestResult {
  success: boolean
  statusCode: number
  statusText: string
  responseBody: string
  responseHeaders: Record<string, string>
  responseSize: number
  dnsTime: number
  tcpTime: number
  tlsTime: number
  ttfb: number
  totalTime: number
  redirectCount: number
  redirectUrls: string[]
  error?: string
  url: string
  method: string
}

// ─── Test Run ─────────────────────────────────────────────────────────────────

export interface TestRun {
  id: string
  config: TestConfig
  status: TestStatus
  startedAt: number
  completedAt?: number
  metrics?: AggregatedMetrics
  error?: string
}

export interface TestReport {
  id: string
  testId: string
  target: string
  testType: TestType
  testName: string
  startedAt: number
  completedAt: number
  duration: number
  config: TestConfig
  metrics: AggregatedMetrics
  observations: string[]
  timeSeries: TimeSeriesPoint[]
  singleRequest?: SingleRequestResult
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  testName: string
  target: string
  testType: TestType
  startedAt: number
  completedAt: number
  duration: number
  totalRequests: number
  successRate: number
  p95: number
  p99: number
  errorRate: number
  requestsPerSecond: number
  status: TestStatus
}

export interface HistoryDetail extends HistoryEntry {
  configSnapshot: string  // JSON
  reportSnapshot: string  // JSON
}

// ─── Worker Messages ──────────────────────────────────────────────────────────

export interface WorkerConfig {
  testId: string
  testType: TestType
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  timeout: number
  load?: LoadConfig
  stress?: StressConfig
  spike?: SpikeConfig
  endurance?: EnduranceConfig
  rateLimit?: RateLimitConfig
}

export interface WorkerMetricsMessage {
  type: 'metrics'
  data: {
    newResults: RequestResult[]
    currentConcurrency: number
    stressLevel?: number
  }
}

export interface WorkerDoneMessage {
  type: 'done'
  error?: string
}

export type WorkerMessage = WorkerMetricsMessage | WorkerDoneMessage

// ─── Safety ───────────────────────────────────────────────────────────────────

export interface SafetyCheck {
  safe: boolean
  reasons: string[]
  isLocal: boolean
  isPrivate: boolean
  requiresConfirmation: boolean
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'csv' | 'html'
