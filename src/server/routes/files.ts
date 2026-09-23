'use sanity'

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { FOLDER_INDEX_NAME, type DocumentStore } from '../storage/fs-store.ts'
import { mediaTypeOf } from '../storage/media-type.ts'
import { joinEntryPath } from '../storage/safe-path.ts'
import { seedDocument, seedFolderIndex } from '../storage/seed.ts'

import { invalidBody, payloadTooLarge, toErrorResponse } from './error-response.ts'

const HTTP_OK = 200
const HTTP_CREATED = 201

// A file served straight from the store is content we did not author. The
// explicit type plus nosniff stops a browser inferring a richer one, and the
// CSP neuters an SVG opened by direct navigation, where it would otherwise be
// a scriptable same-origin document rather than an inert <img> source.
const UNTRUSTED_CONTENT_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
}

const folderBodySchema = z.object({ path: z.string().min(1) })
const documentBodySchema = z.object({ path: z.string().min(1), content: z.string().optional() })

function uploadedFile(body: Record<string, unknown>): File | null {
  const file = body.file

  return file instanceof File ? file : null
}

function targetDirectory(body: Record<string, unknown>): string | null {
  const directory = body.path

  if (directory === undefined) return ''
  return typeof directory === 'string' ? directory : null
}

export function fileRoutes(store: DocumentStore, uploadMaxBytes: number): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => c.json({ tree: await store.tree() }))

  routes.get('/raw/:entryPath{.+}', async (c) => {
    const entryPath = c.req.param('entryPath')
    try {
      const bytes = await store.readBytes(entryPath)
      return c.body(bytes, HTTP_OK, { ...UNTRUSTED_CONTENT_HEADERS, 'content-type': mediaTypeOf(entryPath) })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.post('/uploads', async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > uploadMaxBytes) return payloadTooLarge(c, uploadMaxBytes)

    const body = await c.req.parseBody()
    const file = uploadedFile(body)
    const directory = targetDirectory(body)
    if (file === null || directory === null) return invalidBody(c)

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.length > uploadMaxBytes) return payloadTooLarge(c, uploadMaxBytes)

    try {
      const stored = await store.createUpload(directory, file.name, bytes)
      return c.json({ path: stored }, HTTP_CREATED)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.post(
    '/folders',
    zValidator('json', folderBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const folderPath = c.req.valid('json').path
      try {
        const etag = await store.createFolder(folderPath, seedFolderIndex(folderPath))
        return c.json({ path: joinEntryPath(folderPath, FOLDER_INDEX_NAME), etag }, HTTP_CREATED)
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

      try {
        const etag = await store.createDocument(id, content ?? seedDocument(id))
        return c.json({ path: id, etag }, HTTP_CREATED)
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  return routes
}
