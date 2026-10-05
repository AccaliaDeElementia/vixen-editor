'use sanity'

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import type { Changes, StoreChange } from '../changes.ts'

const CHANGE_EVENT = 'change'

export function eventRoutes(changes: Changes): Hono {
  const routes = new Hono()

  routes.get('/', (c) =>
    streamSSE(c, async (stream) => {
      const closed: PromiseWithResolvers<undefined> = Promise.withResolvers()

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
