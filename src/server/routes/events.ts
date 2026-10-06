'use sanity'

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import type { Changes, StoreChange } from '../changes.ts'

const CHANGE_EVENT = 'change'
const BUILD_EVENT = 'build'

export function eventRoutes(changes: Changes, buildId: string | null): Hono {
  const routes = new Hono()

  routes.get('/', (c) =>
    streamSSE(c, async (stream) => {
      const closed: PromiseWithResolvers<undefined> = Promise.withResolvers()

      if (buildId !== null) await stream.writeSSE({ event: BUILD_EVENT, data: buildId })

      const stopListening = changes.listen((change: StoreChange) => {
        void stream.writeSSE({ event: CHANGE_EVENT, data: JSON.stringify(change) })
      })

      stream.onAbort(() => {
        closed.resolve(undefined)
      })

      await closed.promise
      stopListening()
    }),
  )

  return routes
}
