'use sanity'

import { SEQUENCE_START } from '../../shared/sequences.ts'

import path from 'node:path'

import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

import type { Limits } from '../platform/config.ts'
import { actorOf } from './requesting-actor.ts'
import { compareNamesIn } from '../storage/primitives/name-order.ts'
import type { DocumentStore } from '../storage/fs-store.ts'
import { mediaTypeOf } from '../storage/primitives/media-type.ts'
import { joinEntryPath } from '../storage/primitives/safe-path.ts'
import { seedDocument, seedFolderIndex } from '../storage/primitives/seed.ts'

import { ACCEPT_LANGUAGE, preferredLocale, VARIES_BY_LANGUAGE } from './accept-language.ts'
import { invalidBody, payloadTooLarge, toErrorResponse } from './error-response.ts'
import { BodyTooLargeError, receiveMultipart, type ReceivedBody, type ReceivedFile } from './multipart.ts'
import { FOLDER_INDEX_NAME } from '../../shared/documents.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'

const HTTP_OK = 200
const HTTP_CREATED = 201

const UNTRUSTED_CONTENT_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
}

const NON_EMPTY = 1
const UNDECLARED_LENGTH = 0

const folderBodySchema = z.object({ path: z.string().min(NON_EMPTY) })
const moveBodySchema = z.object({
  from: z.string().min(NON_EMPTY),
  to: z.string().min(NON_EMPTY),
})
const documentBodySchema = z.object({ path: z.string().min(NON_EMPTY), content: z.string().optional() })

const HEX = 16
const UNSAFE_IN_QUOTED_FILENAME = /[^A-Za-z0-9._\-]+/gv

// RFC 5987 attr-char is narrower than what encodeURIComponent leaves alone.
const NOT_ATTR_CHAR = /['\(\)*]/gv

function archiveName(subtree: string): string {
  const leaf = path.posix.basename(subtree)

  return `vixen-${leaf === '' ? 'documents' : leaf}.zip`
}

function contentDisposition(name: string): string {
  const fallback = name.replaceAll(UNSAFE_IN_QUOTED_FILENAME, '_')
  const encoded = encodeURIComponent(name).replaceAll(
    NOT_ATTR_CHAR,
    (character) => `%${character.charCodeAt(SEQUENCE_START).toString(HEX).toUpperCase()}`,
  )

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

const UPLOAD_FIELD = 'file'
const NO_OTHER_FILES = 0

function uploadedFile(received: ReceivedBody): ReceivedFile | null {
  return received.files.find((part) => part.name === UPLOAD_FIELD) ?? null
}

function sentAFieldAsAFile(received: ReceivedBody): boolean {
  return received.files.filter((part) => part.name !== UPLOAD_FIELD).length > NO_OTHER_FILES
}

function storedName(received: ReceivedBody, file: ReceivedFile): string {
  return received.fields.filename ?? file.filename
}

function targetDirectory(received: ReceivedBody): string {
  return received.fields.path ?? STORE_ROOT
}

async function receivedOrRefusal(c: Context, maxBytes: number): Promise<ReceivedBody | Response> {
  try {
    return await receiveMultipart(c.req.raw, maxBytes)
  } catch (error) {
    if (error instanceof BodyTooLargeError) return payloadTooLarge(c, maxBytes)

    return invalidBody(c)
  }
}

export function fileRoutes(store: DocumentStore, limits: Limits): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => {
    const tree = await store.tree(compareNamesIn(preferredLocale(c.req.header(ACCEPT_LANGUAGE))))

    return c.json({ tree }, HTTP_OK, VARIES_BY_LANGUAGE)
  })

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
        return c.json(await store.move({ from, to }, actorOf(c)))
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  routes.delete('/entries/:entryPath{.+}', async (c) => {
    try {
      const id = await store.trash(c.req.param('entryPath'), actorOf(c))
      return c.json({ trashId: id })
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.post('/uploads', async (c) => {
    const declared = Number(c.req.header('content-length') ?? UNDECLARED_LENGTH)
    if (declared > limits.uploadMaxBytes) return payloadTooLarge(c, limits.uploadMaxBytes)

    const received = await receivedOrRefusal(c, limits.uploadMaxBytes)
    if (received instanceof Response) return received

    const file = uploadedFile(received)
    if (file === null || sentAFieldAsAFile(received)) return invalidBody(c)

    try {
      const stored = await store.createUpload(
        targetDirectory(received),
        storedName(received, file),
        file.bytes,
        actorOf(c),
      )
      return c.json({ path: stored }, HTTP_CREATED)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  routes.post(
    '/folders',
    zValidator('json', folderBodySchema, (result, c) => (result.success ? undefined : invalidBody(c))),
    async (c) => {
      const { path: folderPath } = c.req.valid('json')
      try {
        const etag = await store.createFolder(folderPath, seedFolderIndex(folderPath), actorOf(c))
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
        const etag = await store.createDocument(id, content ?? seedDocument(id), actorOf(c))
        return c.json({ path: id, etag }, HTTP_CREATED)
      } catch (error) {
        return toErrorResponse(c, error)
      }
    },
  )

  return routes
}

export const TestOnly = {
  archiveName,
  contentDisposition,
  sentAFieldAsAFile,
  storedName,
  targetDirectory,
  uploadedFile,
}
