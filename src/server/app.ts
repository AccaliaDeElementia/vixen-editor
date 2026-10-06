'use sanity'

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { announcingStore } from './announcing-store.ts'
import { createChanges, type Changes } from './changes.ts'
import { DEFAULT_LIMITS, type Limits } from './config.ts'
import { createLogger } from './logging.ts'
import { documentRoutes } from './routes/documents.ts'
import { eventRoutes } from './routes/events.ts'
import { fileRoutes } from './routes/files.ts'
import { trashRoutes } from './routes/trash.ts'
import type { DocumentStore } from './storage/fs-store.ts'
import { API_PREFIX } from '../shared/api.ts'

const HTTP_INTERNAL_SERVER_ERROR = 500

const logError = createLogger('app', 'onError')

interface AppDependencies {
  store: DocumentStore
  limits?: Limits
  changes?: Changes
  buildId?: string | null
}

export function buildApp({
  store,
  limits = DEFAULT_LIMITS,
  changes = createChanges(),
  buildId = null,
}: AppDependencies): Hono {
  const app = new Hono()
  const announcing = announcingStore(store, changes)

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()

    logError('%s %s failed: %O', c.req.method, c.req.path, error)
    return c.json({ error: 'Internal server error', code: 'INTERNAL' }, HTTP_INTERNAL_SERVER_ERROR)
  })

  app.get(`${API_PREFIX}/health`, (c) => c.json({ status: 'ok' }))
  app.route(`${API_PREFIX}/documents`, documentRoutes(announcing))
  app.route(`${API_PREFIX}/files`, fileRoutes(announcing, limits))
  app.route(`${API_PREFIX}/trash`, trashRoutes(announcing))
  app.route(`${API_PREFIX}/events`, eventRoutes(changes, buildId))

  return app
}
