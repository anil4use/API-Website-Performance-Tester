import type { BreakpointConfig, RemoteAgent } from '../types'

export interface AgentSlice {
  nodeId: string
  name: string
  isLocal: boolean
  virtualUsers: number
  targetRps: number
  durationSeconds: number
}

export interface SplitResult {
  achievable: boolean
  configuredRps: number
  configuredVUs: number
  clusterCapacityRps: number
  singleNodeEstimatedRps: number
  recommendedRpsCap: number
  nodesUsed: number
  slices: AgentSlice[]
  warning?: string
}

// Single node default baseline capacity estimate (can be refined via 2s calibration burst).
// Real-world limits against an EXTERNAL HTTPS website from a single machine:
//   - Local/loopback HTTP APIs:    10,000–50,000 RPS  (no network RTT, no TLS)
//   - Internal LAN HTTPS API:       2,000–10,000 RPS  (LAN RTT ~0.5ms, TLS)
//   - Public internet HTTPS site:     500–4,000 RPS   (RTT 20-200ms, TLS, CDN throttle)
// Reaching 50k+ RPS requires distributed load across multiple machines.
// Use the "Calibrate Machine" button to measure actual throughput for a specific target.
export const DEFAULT_SINGLE_NODE_CAPACITY_RPS = 3000

export function evaluateAndSplitLoad(
  config: BreakpointConfig,
  connectedAgents: RemoteAgent[] = [],
  singleNodeCapacity: number = DEFAULT_SINGLE_NODE_CAPACITY_RPS
): SplitResult {
  const { targetVirtualUsers, targetRequestsPerSecond, burstDurationSeconds, distributedNodes } = config

  // Available nodes: local worker + idle remote agents
  const activeRemoteAgents = connectedAgents.filter(a => a.status === 'idle')
  // Total potential nodes available: 1 (local) + activeRemoteAgents.length
  const totalAvailableNodes = 1 + activeRemoteAgents.length
  // How many nodes we are going to assign: min(distributedNodes, totalAvailableNodes)
  const nodesToUse = Math.max(1, Math.min(distributedNodes, totalAvailableNodes))

  // Estimate total cluster capacity
  const clusterCapacityRps = nodesToUse * singleNodeCapacity
  const achievable = targetRequestsPerSecond <= clusterCapacityRps

  const recommendedRpsCap = Math.min(targetRequestsPerSecond, clusterCapacityRps)

  let warning: string | undefined
  if (!achievable) {
    const requiredNodes = Math.ceil(targetRequestsPerSecond / singleNodeCapacity)
    warning = `Configured target of ${targetRequestsPerSecond.toLocaleString()} RPS exceeds cluster capacity (${clusterCapacityRps.toLocaleString()} RPS across ${nodesToUse} node${nodesToUse > 1 ? 's' : ''}). Estimated maximum achievable is ${clusterCapacityRps.toLocaleString()} RPS. Connect ${requiredNodes - nodesToUse} more remote agent${(requiredNodes - nodesToUse) > 1 ? 's' : ''} or cap RPS.`
  }

  // Calculate slices:
  // If nodesToUse === 1, 100% goes to local node
  // If nodesToUse > 1, 1 slice to local + (nodesToUse - 1) slices to remote agents
  const slices: AgentSlice[] = []

  const perNodeVUs = Math.max(1, Math.floor(targetVirtualUsers / nodesToUse))
  const perNodeRps = Math.max(1, Math.floor(targetRequestsPerSecond / nodesToUse))

  // Local slice
  slices.push({
    nodeId: 'local',
    name: 'Local Worker',
    isLocal: true,
    virtualUsers: perNodeVUs + (targetVirtualUsers - perNodeVUs * nodesToUse), // distribute remainder to local
    targetRps: perNodeRps + (targetRequestsPerSecond - perNodeRps * nodesToUse),
    durationSeconds: burstDurationSeconds,
  })

  // Remote agent slices
  const remoteAgentsToAssign = activeRemoteAgents.slice(0, nodesToUse - 1)
  for (const agent of remoteAgentsToAssign) {
    slices.push({
      nodeId: agent.id,
      name: agent.name || `Remote Agent ${agent.id.slice(0, 6)}`,
      isLocal: false,
      virtualUsers: perNodeVUs,
      targetRps: perNodeRps,
      durationSeconds: burstDurationSeconds,
    })
  }

  return {
    achievable,
    configuredRps: targetRequestsPerSecond,
    configuredVUs: targetVirtualUsers,
    clusterCapacityRps,
    singleNodeEstimatedRps: singleNodeCapacity,
    recommendedRpsCap,
    nodesUsed: slices.length,
    slices,
    warning,
  }
}
