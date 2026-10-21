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
import {
  archiveCollides,
  archiveRefused,
  invalidBody,
  payloadTooLarge,
  toErrorResponse,
  unsupportedFormat,
} from './error-response.ts'
import { archiveFormatOf } from '../storage/archive-format.ts'
import { archiveFormatNamed, type ArchiveFormat } from '../../shared/archive-formats.ts'
import { importArchive } from '../storage/import-archive.ts'
import { open, rm } from 'node:fs/promises'
import {
  BodyTooLargeError,
  receiveArchive,
  receiveMultipart,
  type ReceivedArchive,
  type ReceivedBody,
  type ReceivedFile,
} from './multipart.ts'
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

const WHOLE_STORE = 'documents'
const DEFAULT_FORMAT = 'zip'
const ARCHIVE_MEDIA_TYPES: Readonly<Record<ArchiveFormat, string>> = {
  zip: 'application/zip',
  'tar.gz': 'application/gzip',
}
function archiveName(subtree: string, format: ArchiveFormat): string {
  const leaf = path.posix.basename(subtree)

  return `vixen-${leaf === '' ? WHOLE_STORE : leaf}.${format}`
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
const ONE_ARCHIVE = 1

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

const ARCHIVE_HEAD_BYTES = 8
const UNREADABLE = null

async function headOf(staged: string): Promise<Uint8Array> {
  const file = await open(staged)
  try {
    const { buffer } = await file.read(new Uint8Array(ARCHIVE_HEAD_BYTES), SEQUENCE_START, ARCHIVE_HEAD_BYTES)

    return buffer
  } finally {
    await file.close()
  }
}

async function archiveOrRefusal(c: Context, staged: string, maxBytes: number): Promise<ReceivedArchive | Response> {
  try {
    return await receiveArchive(c.req.raw, maxBytes, staged)
  } catch (error) {
    if (error instanceof BodyTooLargeError) return payloadTooLarge(c, maxBytes)

    return invalidBody(c)
  }
}

async function importInto(c: Context, store: DocumentStore, staged: string, maxBytes: number): Promise<Response> {
  const received = await archiveOrRefusal(c, staged, maxBytes)
  if (received instanceof Response) return received

  const { parts } = received
  const [only] = parts
  if (only === undefined || parts.length !== ONE_ARCHIVE || only.name !== UPLOAD_FIELD) return invalidBody(c)

  const format = archiveFormatOf(await headOf(staged))
  if (format === null) return invalidBody(c)

  const outcome = await importArchive({
    store,
    archivePath: staged,
    format,
    into: received.fields.path ?? STORE_ROOT,
    actor: actorOf(c),
  }).catch(() => UNREADABLE)
  if (outcome === UNREADABLE) return invalidBody(c)
  if (outcome.kind === 'refused') return archiveRefused(c, outcome.reasons)
  if (outcome.kind === 'collides') return archiveCollides(c, outcome.paths)

  return c.json({ paths: outcome.paths }, HTTP_CREATED)
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
    const format = archiveFormatNamed(c.req.query('format') ?? DEFAULT_FORMAT)
    if (format === null) return unsupportedFormat(c)

    try {
      const stream = await store.archive(subtree, {
        format,
        maxBytes: limits.archiveMaxBytes,
        maxEntries: limits.archiveMaxEntries,
      })

      return c.body(stream, HTTP_OK, {
        'content-type': ARCHIVE_MEDIA_TYPES[format],
        'content-disposition': contentDisposition(archiveName(subtree, format)),
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

  routes.post('/imports', async (c) => {
    const declared = Number(c.req.header('content-length') ?? UNDECLARED_LENGTH)
    if (declared > limits.archiveMaxBytes) return payloadTooLarge(c, limits.archiveMaxBytes)

    const staged = await store.stageArchive()
    try {
      return await importInto(c, store, staged, limits.archiveMaxBytes)
    } finally {
      await rm(staged, { force: true })
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
