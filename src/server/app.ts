'use sanity'

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { DEFAULT_UPLOAD_MAX_BYTES } from './config.ts'
import { createLogger } from './logging.ts'
import { documentRoutes } from './routes/documents.ts'
import { fileRoutes } from './routes/files.ts'
import type { DocumentStore } from './storage/fs-store.ts'

const HTTP_INTERNAL_SERVER_ERROR = 500

export const CLACKS_HEADER = 'X-Clacks-Overhead'
export const CLACKS_VALUE = 'GNU Terry Pratchett'

const logError = createLogger('app', 'onError')

export interface AppDependencies {
  store: DocumentStore
  uploadMaxBytes?: number
}

export function buildApp({ store, uploadMaxBytes = DEFAULT_UPLOAD_MAX_BYTES }: AppDependencies): Hono {
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

  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.route('/api/documents', documentRoutes(store))
  app.route('/api/files', fileRoutes(store, uploadMaxBytes))

  return app
}
