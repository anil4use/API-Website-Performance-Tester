import { NextRequest, NextResponse } from 'next/server'
import { executeSingleRequest } from '@/lib/single-request'
import { checkUrlSafety, buildQueryString } from '@/lib/safety'
import { applyGenerators } from '@/lib/generators'
import type { RequestConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, config, allowLocal } = body as {
      url: string
      config: RequestConfig
      allowLocal?: boolean
    }

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const safety = checkUrlSafety(url, allowLocal ?? false)
    if (!safety.safe) {
      return NextResponse.json({ error: safety.reasons.join(' '), safety }, { status: 400 })
    }

    // Apply variable generators to body
    const resolvedConfig = {
      ...config,
      body: config.body ? applyGenerators(config.body) : config.body,
    }

    const result = await executeSingleRequest(url, resolvedConfig)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
