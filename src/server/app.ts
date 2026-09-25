'use sanity'

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { DEFAULT_LIMITS, type Limits } from './config.ts'
import { createLogger } from './logging.ts'
import { documentRoutes } from './routes/documents.ts'
import { fileRoutes } from './routes/files.ts'
import { trashRoutes } from './routes/trash.ts'
import type { DocumentStore } from './storage/fs-store.ts'
import { API_PREFIX } from '../shared/api.ts'

const HTTP_INTERNAL_SERVER_ERROR = 500

const CLACKS_HEADER = 'X-Clacks-Overhead'
const CLACKS_VALUE = 'GNU Terry Pratchett'

const logError = createLogger('app', 'onError')

interface AppDependencies {
  store: DocumentStore
  limits?: Limits
}

export function buildApp({ store, limits = DEFAULT_LIMITS }: AppDependencies): Hono {
  const app = new Hono()

  app.use('*', async (c, next) => {
    try {
      await next()
    } finally {
      c.header(CLACKS_HEADER, CLACKS_VALUE)
    }
  })

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()

    logError('%s %s failed: %O', c.req.method, c.req.path, error)
    return c.json({ error: 'Internal server error', code: 'INTERNAL' }, HTTP_INTERNAL_SERVER_ERROR)
  })

  app.get(`${API_PREFIX}/health`, (c) => c.json({ status: 'ok' }))
  app.route(`${API_PREFIX}/documents`, documentRoutes(store))
  app.route(`${API_PREFIX}/files`, fileRoutes(store, limits))
  app.route(`${API_PREFIX}/trash`, trashRoutes(store))

  return app
}

export const TestOnly = { CLACKS_HEADER, CLACKS_VALUE }
