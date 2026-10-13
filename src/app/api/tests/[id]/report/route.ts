import { NextRequest, NextResponse } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const orch = getOrchestrator()

    const report = orch.getReport(id)
    if (report) return NextResponse.json(report)

    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

