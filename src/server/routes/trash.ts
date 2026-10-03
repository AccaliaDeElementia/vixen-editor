'use sanity'

import { Hono } from 'hono'

import type { DocumentStore } from '../storage/fs-store.ts'

import { toErrorResponse } from './error-response.ts'

const HTTP_NO_CONTENT = 204

export function trashRoutes(store: DocumentStore): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => c.json({ entries: await store.listTrash() }))

  routes.get('/:entryId/entries', async (c) => {
    try {
      return c.json({ entry: await store.trashEntry(c.req.param('entryId')) })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.post('/:entryId/restore', async (c) => {
    try {
      return c.json({ path: await store.restore(c.req.param('entryId')) })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.delete('/:entryId', async (c) => {
    try {
      await store.purge(c.req.param('entryId'))
      return c.body(null, HTTP_NO_CONTENT)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  return routes
}
