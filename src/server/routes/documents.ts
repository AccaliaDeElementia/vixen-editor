'use sanity'

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { computeEtag } from '../storage/etag.ts'
import type { DocumentStore } from '../storage/fs-store.ts'

import { matchesAny } from './conditional.ts'
import { invalidBody, preconditionRequired, toErrorResponse } from './error-response.ts'

const HTTP_OK = 200
const HTTP_NOT_MODIFIED = 304
const HTTP_NO_CONTENT = 204

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

const writeBodySchema = z.object({ content: z.string() })

export function documentRoutes(store: DocumentStore): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => c.json({ documents: await store.list() }))

  routes.get('/:id{.+}', async (c) => {
    const id = c.req.param('id')
    try {
      const content = await store.read(id)
      const etag = computeEtag(content)
      if (matchesAny(c.req.header('if-none-match'), etag)) return c.body(null, HTTP_NOT_MODIFIED, { etag })

      return c.text(content, HTTP_OK, { 'content-type': MARKDOWN_CONTENT_TYPE, etag })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.put(
    '/:id{.+}',
    zValidator('json', writeBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const id = c.req.param('id')
      const ifMatch = c.req.header('if-match')
      if (ifMatch === undefined) return preconditionRequired(c)

      try {
        const etag = await store.updateDocument(id, c.req.valid('json').content, ifMatch)
        return c.body(null, HTTP_NO_CONTENT, { etag })
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  return routes
}
