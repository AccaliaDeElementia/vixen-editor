'use sanity'

import path from 'node:path'

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import type { Limits } from '../config.ts'
import type { DocumentStore } from '../storage/fs-store.ts'
import { mediaTypeOf } from '../storage/media-type.ts'
import { joinEntryPath } from '../storage/safe-path.ts'
import { seedDocument, seedFolderIndex } from '../storage/seed.ts'

import { invalidBody, payloadTooLarge, toErrorResponse } from './error-response.ts'
import { FOLDER_INDEX_NAME } from '../../shared/documents.ts'

const HTTP_OK = 200
const HTTP_CREATED = 201

const UNTRUSTED_CONTENT_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
}

const folderBodySchema = z.object({ path: z.string().min(1) })
const moveBodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
})
const documentBodySchema = z.object({ path: z.string().min(1), content: z.string().optional() })

const HEX = 16
const UNSAFE_IN_QUOTED_FILENAME = /[^A-Za-z0-9._-]+/gu

// RFC 5987 attr-char is narrower than what encodeURIComponent leaves alone.
const NOT_ATTR_CHAR = /['()*]/gu

function archiveName(subtree: string): string {
  const leaf = path.posix.basename(subtree)

  return `vixen-${leaf === '' ? 'documents' : leaf}.zip`
}

function contentDisposition(name: string): string {
  const fallback = name.replaceAll(UNSAFE_IN_QUOTED_FILENAME, '_')
  const encoded = encodeURIComponent(name).replaceAll(
    NOT_ATTR_CHAR,
    (character) => `%${character.charCodeAt(0).toString(HEX).toUpperCase()}`,
  )

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

function uploadedFile(body: Record<string, unknown>): File | null {
  const file = body.file

  return file instanceof File ? file : null
}

function targetDirectory(body: Record<string, unknown>): string | null {
  const directory = body.path

  if (directory === undefined) return ''
  return typeof directory === 'string' ? directory : null
}

export function fileRoutes(store: DocumentStore, limits: Limits): Hono {
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

  routes.get('/archive', async (c) => {
    const subtree = c.req.query('path') ?? ''
    try {
      const stream = await store.archive(subtree, {
        maxBytes: limits.archiveMaxBytes,
        maxEntries: limits.archiveMaxEntries,
      })

      return c.body(stream, HTTP_OK, {
        'content-type': 'application/zip',
        'content-disposition': contentDisposition(archiveName(subtree)),
      })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.post(
    '/moves',
    zValidator('json', moveBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const { from, to } = c.req.valid('json')
      try {
        return c.json(await store.move({ from, to }))
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  routes.delete('/entries/:entryPath{.+}', async (c) => {
    try {
      const id = await store.trash(c.req.param('entryPath'))
      return c.json({ trashId: id })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.post('/uploads', async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > limits.uploadMaxBytes) return payloadTooLarge(c, limits.uploadMaxBytes)

    const body = await c.req.parseBody()
    const file = uploadedFile(body)
    const directory = targetDirectory(body)
    if (file === null || directory === null) return invalidBody(c)

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.length > limits.uploadMaxBytes) return payloadTooLarge(c, limits.uploadMaxBytes)

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
