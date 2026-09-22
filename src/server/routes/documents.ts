'use sanity'

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'

import { toError } from '../errors.ts'
import { DocumentNotFoundError, type DocumentStore } from '../storage/fs-store.ts'
import { InvalidPathError } from '../storage/safe-path.ts'

const HTTP_OK = 200
const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

const writeBodySchema = z.object({ content: z.string() })

function toErrorResponse(c: Context, error: unknown): Response {
  if (error instanceof InvalidPathError) {
    return c.json({ error: 'Invalid document id' }, HTTP_BAD_REQUEST)
  }
  if (error instanceof DocumentNotFoundError) {
    return c.json({ error: 'Document not found' }, HTTP_NOT_FOUND)
  }
  throw toError(error)
}

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
    zValidator('json', writeBodySchema, (result, c) =>
      result.success ? undefined : c.json({ error: 'Invalid request body' }, HTTP_BAD_REQUEST),
    ),
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
