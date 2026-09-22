'use sanity'

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { FOLDER_INDEX_NAME, type DocumentStore } from '../storage/fs-store.ts'
import { seedDocument, seedFolderIndex } from '../storage/seed.ts'

import { emptyContent, invalidBody, toErrorResponse } from './error-response.ts'

const HTTP_CREATED = 201

const folderBodySchema = z.object({ path: z.string().min(1) })
const documentBodySchema = z.object({ path: z.string().min(1), content: z.string().optional() })

function isBlank(content: string): boolean {
  return content.trim() === ''
}

export function fileRoutes(store: DocumentStore): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => c.json({ tree: await store.tree() }))

  routes.post(
    '/folders',
    zValidator('json', folderBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const folderPath = c.req.valid('json').path
      try {
        await store.createFolder(folderPath, seedFolderIndex(folderPath))
        return c.json({ path: `${folderPath}/${FOLDER_INDEX_NAME}` }, HTTP_CREATED)
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  routes.post(
    '/documents',
    zValidator('json', documentBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const { path: id, content } = c.req.valid('json')
      if (content !== undefined && isBlank(content)) return emptyContent(c)

      try {
        await store.createDocument(id, content ?? seedDocument(id))
        return c.json({ path: id }, HTTP_CREATED)
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  return routes
}
