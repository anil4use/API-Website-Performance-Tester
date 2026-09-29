import { NextRequest, NextResponse } from 'next/server'
import { getHistoryEntry, deleteHistoryEntry } from '@/lib/db'
import { getOrchestrator } from '@/lib/engine/orchestrator'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    // Check active tests first
    const orch = getOrchestrator()
    const run = orch.getRun(id)
    if (run) {
      return NextResponse.json({ run, source: 'active' })
    }

    // Check history
    const entry = await getHistoryEntry(id)
    if (!entry) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 })
    }
    return NextResponse.json({ entry, source: 'history' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const deleted = await deleteHistoryEntry(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
