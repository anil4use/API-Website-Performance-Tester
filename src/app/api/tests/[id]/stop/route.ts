import { NextRequest, NextResponse } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const orch = getOrchestrator()
  const stopped = orch.stop(params.id)
  if (!stopped) {
    return NextResponse.json({ error: 'Test not found or already stopped' }, { status: 404 })
  }
  return NextResponse.json({ stopped: true })
}
