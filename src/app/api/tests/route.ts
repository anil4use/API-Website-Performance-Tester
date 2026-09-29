import { NextRequest, NextResponse } from 'next/server'
import { getHistory, getHistoryCount } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') ?? '50')
    const offset = parseInt(searchParams.get('offset') ?? '0')

    const [history, total] = await Promise.all([
      getHistory(limit, offset),
      getHistoryCount(),
    ])

    return NextResponse.json({ history, total, limit, offset })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
