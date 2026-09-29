import { NextRequest, NextResponse } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'
import { getHistoryEntry } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const orch = getOrchestrator()

    // Try active test first
    const report = orch.getReport(id)
    if (report) return NextResponse.json(report)

    // Try history
    const entry = await getHistoryEntry(id)
    if (entry) {
      const savedReport = JSON.parse(entry.reportSnapshot)
      return NextResponse.json(savedReport)
    }

    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
