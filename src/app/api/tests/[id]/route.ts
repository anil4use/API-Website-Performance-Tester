import { NextRequest, NextResponse } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const orch = getOrchestrator()
    const run = orch.getRun(id)
    if (run) {
      return NextResponse.json({ run, source: 'active' })
    }

    return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

