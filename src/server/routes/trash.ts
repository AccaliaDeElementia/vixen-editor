'use sanity'

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import type { DocumentStore } from '../storage/fs-store.ts'

import { invalidBody, toErrorResponse } from './error-response.ts'

const HTTP_NO_CONTENT = 204

const AT_LEAST_ONE = 1

const restoreBodySchema = z.object({ paths: z.array(z.string()).min(AT_LEAST_ONE) })

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

  routes.post(
    '/:entryId/restores',
    zValidator('json', restoreBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const { paths } = c.req.valid('json')
      try {
        return c.json(await store.restore({ entryId: c.req.param('entryId'), paths }))
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

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
