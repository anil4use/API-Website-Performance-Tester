import { NextRequest, NextResponse } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'

export const dynamic = 'force-dynamic'

// Pause or resume a running test
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { action } = await req.json() as { action: 'pause' | 'resume' }
  const orch = getOrchestrator()

  if (action === 'pause') {
    const ok = orch.pause(params.id)
    return NextResponse.json(ok ? { paused: true } : { error: 'Cannot pause' }, { status: ok ? 200 : 400 })
  } else if (action === 'resume') {
    const ok = orch.resume(params.id)
    return NextResponse.json(ok ? { resumed: true } : { error: 'Cannot resume' }, { status: ok ? 200 : 400 })
  }

  return NextResponse.json({ error: 'Invalid action. Use pause or resume.' }, { status: 400 })
}
