import { NextRequest } from 'next/server'
import { getOrchestrator } from '@/lib/engine/orchestrator'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const orch = getOrchestrator()
  let logOffset = 0

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()

      function send(data: unknown) {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* client disconnected */ }
      }

      const interval = setInterval(() => {
        const status = orch.getStatus(id)

        if (!status) {
          send({ type: 'error', message: 'Test not found' })
          clearInterval(interval)
          try { controller.close() } catch { /* already closed */ }
          return
        }

        const metrics = orch.getMetrics(id)
        const { entries: logs, nextOffset } = orch.getLogsFrom(id, logOffset)
        logOffset = nextOffset

        if (metrics) {
          send({ type: 'metrics', data: metrics, status, logs })
        } else {
          send({ type: 'status', status, logs })
        }

        if (['completed', 'stopped', 'failed'].includes(status)) {
          const report = orch.getReport(id)
          if (report) send({ type: 'report', data: report })
          clearInterval(interval)
          setTimeout(() => {
            try { controller.close() } catch { /* already closed */ }
          }, 100)
        }
      }, 300)

      return () => clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
