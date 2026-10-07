'use sanity'

import { Hono } from 'hono'
import { streamSSE, type SSEStreamingApi } from 'hono/streaming'

import type { Changes, StoreChange } from '../changes.ts'

const CHANGE_EVENT = 'change'
const BUILD_EVENT = 'build'
const HEARTBEAT_EVENT = 'heartbeat'
const SYNC_EVENT = 'sync'
const NOTHING_TO_SAY = ''

const HEARTBEAT_MS = 60_000

interface KeepingAlive {
  reset: () => void
  stop: () => void
}

function keepingAlive(afterMs: number, beat: () => void): KeepingAlive {
  let pending: ReturnType<typeof setTimeout> | undefined = undefined

  return {
    reset: () => {
      clearTimeout(pending)
      pending = setTimeout(beat, afterMs)
    },
    stop: () => {
      clearTimeout(pending)
    },
  }
}

interface EventOptions {
  changes: Changes
  buildId: string | null
  heartbeatMs?: number | undefined
}

export function eventRoutes(options: EventOptions): Hono {
  const routes = new Hono()
  const { changes, buildId } = options
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS

  routes.get('/', (c) =>
    streamSSE(c, async (stream: SSEStreamingApi) => {
      const closed: PromiseWithResolvers<undefined> = Promise.withResolvers()
      const alive = keepingAlive(heartbeatMs, () => {
        say(HEARTBEAT_EVENT, NOTHING_TO_SAY)
      })

      function say(event: string, data: string): void {
        alive.reset()
        void stream.writeSSE({ event, data, id: String(changes.lastAnnouncedAt()) })
      }

      if (buildId !== null) await stream.writeSSE({ event: BUILD_EVENT, data: buildId })
      say(SYNC_EVENT, NOTHING_TO_SAY)

      const stopListening = changes.listen((change: StoreChange) => {
        say(CHANGE_EVENT, JSON.stringify(change))
      })

      stream.onAbort(() => {
        closed.resolve(undefined)
      })

      await closed.promise
      alive.stop()
      stopListening()
    }),
  )

  return routes
}
