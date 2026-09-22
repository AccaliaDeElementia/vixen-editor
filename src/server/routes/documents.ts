'use sanity'

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import type { DocumentStore } from '../storage/fs-store.ts'

import { invalidBody, toErrorResponse } from './error-response.ts'

const HTTP_OK = 200
const HTTP_NO_CONTENT = 204

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

const writeBodySchema = z.object({ content: z.string() })

export function documentRoutes(store: DocumentStore): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => c.json({ documents: await store.list() }))

  routes.get('/:id{.+}', async (c) => {
    const id = c.req.param('id')
    try {
      return c.text(await store.read(id), HTTP_OK, { 'content-type': MARKDOWN_CONTENT_TYPE })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.put(
    '/:id{.+}',
    zValidator('json', writeBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const id = c.req.param('id')
      try {
        await store.write(id, c.req.valid('json').content)
        return c.body(null, HTTP_NO_CONTENT)
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  routes.delete('/:id{.+}', async (c) => {
    const id = c.req.param('id')
    try {
      await store.remove(id)
      return c.body(null, HTTP_NO_CONTENT)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  return routes
}
