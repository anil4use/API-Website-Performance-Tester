import { NextRequest, NextResponse } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'
import { checkUrlSafety } from '@/lib/safety'
import type { TestConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { config } = body as { config: TestConfig }

    if (!config?.target) {
      return NextResponse.json({ error: 'Test config with target URL is required' }, { status: 400 })
    }

    const safety = checkUrlSafety(config.target, config.request?.timeout !== undefined)
    // For load tests we allow local if user has allowLocal in config
    // The safety check was already done client-side with user confirmation
    // But we still block truly dangerous targets
    if (!safety.safe && !config.authorizedByUser) {
      return NextResponse.json({ error: `Unsafe target: ${safety.reasons.join(' ')}` }, { status: 400 })
    }

    const orch = getOrchestrator()

    // Check if a test with this ID is already running
    const existing = orch.getStatus(params.id)
    if (existing === 'running') {
      return NextResponse.json({ error: 'A test with this ID is already running' }, { status: 409 })
    }

    // Use the provided ID from params (client generates it)
    config.id = params.id
    const run = await orch.createAndStart(config)

    return NextResponse.json({ run, testId: run.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
