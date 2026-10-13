import { NextRequest, NextResponse } from 'next/server'
import { getAgentRegistry } from '@/lib/engine/agent-registry'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const registry = getAgentRegistry()
    const status = registry.getClusterStatus()
    return NextResponse.json(status)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const registry = getAgentRegistry()

    if (body.action === 'rotate_token') {
      const newToken = registry.rotateToken()
      return NextResponse.json({ token: newToken, success: true })
    }

    if (body.calibratedRps) {
      registry.setCalibratedRps(Number(body.calibratedRps))
      return NextResponse.json({ success: true, calibratedRps: registry.getCalibratedRps() })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
