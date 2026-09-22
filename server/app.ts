'use sanity'

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { createLogger } from './logging.ts'
import { documentRoutes } from './routes/documents.ts'
import type { DocumentStore } from './storage/fs-store.ts'

const HTTP_INTERNAL_SERVER_ERROR = 500

const logError = createLogger('app', 'onError')

export interface AppDependencies {
  store: DocumentStore
}

export function buildApp({ store }: AppDependencies): Hono {
  const app = new Hono()

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()

    logError('%s %s failed: %O', c.req.method, c.req.path, error)
    return c.json({ error: 'Internal server error' }, HTTP_INTERNAL_SERVER_ERROR)
  })

  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.route('/api/documents', documentRoutes(store))

  return app
}
