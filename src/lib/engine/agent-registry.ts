import { WebSocketServer, WebSocket } from 'ws'
import crypto from 'crypto'
import type { RemoteAgent, ClusterStatus, WorkerConfig, RequestResult } from '../types'
import type { AgentSlice } from './load-splitter'

export interface AgentBatchMetrics {
  agentId: string
  testId: string
  newResults: RequestResult[]
  currentConcurrency: number
  logs: any[]
}

type MetricsListener = (metrics: AgentBatchMetrics) => void
type DoneListener = (agentId: string, testId: string, error?: string) => void

interface ConnectedClient {
  agent: RemoteAgent
  ws: WebSocket
}

export class AgentRegistry {
  private wss: WebSocketServer | null = null
  private agents = new Map<string, ConnectedClient>()
  private clusterToken: string = ''
  private port: number = 4005
  private metricsListeners = new Map<string, MetricsListener>()
  private doneListeners = new Map<string, DoneListener>()
  private calibratedRps: number = 3000 // conservative default for external HTTPS targets; calibrate for accurate value

  constructor(port: number = 4005) {
    this.port = port
    this.generateToken()
    this.initServer()
  }

  private generateToken(): string {
    this.clusterToken = 'brk_' + crypto.randomBytes(16).toString('hex')
    return this.clusterToken
  }

  public getToken(): string {
    return this.clusterToken
  }

  public rotateToken(): string {
    this.generateToken()
    // Disconnect existing agents when token rotates
    for (const [, client] of this.agents) {
      try {
        client.ws.close(4001, 'Token rotated')
      } catch { /* ignore */ }
    }
    this.agents.clear()
    return this.clusterToken
  }

  public getCalibratedRps(): number {
    return this.calibratedRps
  }

  public setCalibratedRps(rps: number) {
    this.calibratedRps = Math.max(1000, Math.round(rps))
  }

  private initServer(): void {
    if (this.wss) return

    try {
      this.wss = new WebSocketServer({ port: this.port })

      this.wss.on('listening', () => {
        console.log(`[AgentRegistry] WebSocket server running on ws://localhost:${this.port}`)
      })

      this.wss.on('connection', (ws: WebSocket, req) => {
        const clientIp = req.socket.remoteAddress || 'unknown'
        let authenticated = false
        let agentId = ''

        // Authentication timeout: agent must send register packet within 5 seconds
        const authTimeout = setTimeout(() => {
          if (!authenticated) {
            try { ws.close(4002, 'Authentication timeout') } catch { /* ignore */ }
          }
        }, 5000)

        ws.on('message', (data: Buffer | string) => {
          try {
            const msg = JSON.parse(data.toString())

            // 1. Registration & Handshake
            if (msg.type === 'register') {
              if (msg.token !== this.clusterToken) {
                ws.send(JSON.stringify({ type: 'register_failed', error: 'Invalid cluster token' }))
                ws.close(4003, 'Unauthorized')
                return
              }

              clearTimeout(authTimeout)
              authenticated = true
              agentId = msg.agentId || crypto.randomUUID()

              const agent: RemoteAgent = {
                id: agentId,
                name: msg.name || `agent-${agentId.slice(0, 6)}`,
                host: clientIp,
                status: 'idle',
                connectedAt: Date.now(),
                lastHeartbeat: Date.now(),
                capacityRps: msg.capacityRps || 50000,
                capacityVUs: msg.capacityVUs || 10000,
                totalRequestsHandled: 0,
              }

              this.agents.set(agentId, { agent, ws })
              ws.send(JSON.stringify({ type: 'registered', agentId, success: true }))
              return
            }

            // Must be authenticated for any subsequent messages
            if (!authenticated || !agentId) return

            const client = this.agents.get(agentId)
            if (client) {
              client.agent.lastHeartbeat = Date.now()
            }

            // 2. Heartbeat Pong
            if (msg.type === 'pong') {
              return
            }

            // 3. Metrics Batch from Agent
            if (msg.type === 'metrics_batch') {
              const listener = this.metricsListeners.get(msg.testId)
              if (listener) {
                listener({
                  agentId,
                  testId: msg.testId,
                  newResults: msg.newResults || [],
                  currentConcurrency: msg.currentConcurrency || 0,
                  logs: msg.logs || [],
                })
              }
              if (client && msg.newResults) {
                client.agent.totalRequestsHandled += msg.newResults.length
              }
              return
            }

            // 4. Test Done from Agent
            if (msg.type === 'done') {
              if (client) {
                client.agent.status = 'idle'
                client.agent.currentLoad = undefined
              }
              const doneListener = this.doneListeners.get(msg.testId)
              if (doneListener) {
                doneListener(agentId, msg.testId, msg.error)
              }
              return
            }
          } catch (err: any) {
            console.error('[AgentRegistry] Message parse error:', err.message)
          }
        })

        ws.on('close', () => {
          clearTimeout(authTimeout)
          if (agentId) {
            this.agents.delete(agentId)
          }
        })

        ws.on('error', () => {
          clearTimeout(authTimeout)
          if (agentId) {
            this.agents.delete(agentId)
          }
        })
      })

      // Periodic ping every 10 seconds to detect dead connections
      setInterval(() => {
        const now = Date.now()
        for (const [id, client] of this.agents) {
          if (now - client.agent.lastHeartbeat > 25000) {
            try { client.ws.terminate() } catch { /* ignore */ }
            this.agents.delete(id)
          } else {
            try {
              if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ type: 'ping', ts: now }))
              }
            } catch { /* ignore */ }
          }
        }
      }, 10000)

    } catch (err: any) {
      console.error('[AgentRegistry] Error creating WebSocketServer:', err.message)
    }
  }

  public getConnectedAgents(): RemoteAgent[] {
    return Array.from(this.agents.values()).map(c => c.agent)
  }

  public getClusterStatus(): ClusterStatus {
    const agents = this.getConnectedAgents()
    const clusterRps = (1 + agents.length) * this.calibratedRps

    return {
      token: this.clusterToken,
      totalAgents: agents.length,
      connectedAgents: agents,
      singleNodeEstimatedRps: this.calibratedRps,
      totalClusterEstimatedRps: clusterRps,
    }
  }

  public registerMetricsListener(testId: string, listener: MetricsListener) {
    this.metricsListeners.set(testId, listener)
  }

  public registerDoneListener(testId: string, listener: DoneListener) {
    this.doneListeners.set(testId, listener)
  }

  public unregisterTest(testId: string) {
    this.metricsListeners.delete(testId)
    this.doneListeners.delete(testId)
  }

  public dispatchLoad(testId: string, baseConfig: WorkerConfig, slices: AgentSlice[]): void {
    for (const slice of slices) {
      if (slice.isLocal) continue // Local worker is handled by orchestrator

      const client = this.agents.get(slice.nodeId)
      if (!client || client.ws.readyState !== WebSocket.OPEN) continue

      client.agent.status = 'busy'
      client.agent.currentLoad = {
        testId,
        vus: slice.virtualUsers,
        rps: slice.targetRps,
      }

      const payload = {
        type: 'assign_load',
        testId,
        config: {
          ...baseConfig,
          breakpoint: {
            ...baseConfig.breakpoint!,
            targetVirtualUsers: slice.virtualUsers,
            targetRequestsPerSecond: slice.targetRps,
            burstDurationSeconds: slice.durationSeconds,
          },
        },
        virtualUsers: slice.virtualUsers,
        targetRps: slice.targetRps,
        duration: slice.durationSeconds,
      }

      client.ws.send(JSON.stringify(payload))
    }
  }

  public stopTestOnAgents(testId: string): void {
    const payload = JSON.stringify({ type: 'stop', testId })
    for (const [, client] of this.agents) {
      if (client.agent.currentLoad?.testId === testId) {
        client.agent.status = 'idle'
        client.agent.currentLoad = undefined
        try {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(payload)
          }
        } catch { /* ignore */ }
      }
    }
  }
}

// Module-level singleton
declare global {
  // eslint-disable-next-line no-var
  var __agentRegistry: AgentRegistry | undefined
}

export function getAgentRegistry(): AgentRegistry {
  if (!global.__agentRegistry) {
    global.__agentRegistry = new AgentRegistry(4005)
  } else {
    Object.setPrototypeOf(global.__agentRegistry, AgentRegistry.prototype)
  }
  return global.__agentRegistry
}
