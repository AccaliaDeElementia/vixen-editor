'use sanity'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

import { applyDebugFilter } from '../../../src/server/platform/logging.ts'
import { loggedDuring } from '../logged.ts'
import { LockTimeoutError } from '../../../src/server/platform/lock.ts'
import { InvalidPathError } from '../../../src/server/storage/primitives/safe-path.ts'
import {
  ArchiveTooLargeError,
  BlockedRestoreError,
  ConcurrentModificationError,
  ContentMismatchError,
  DocumentNotFoundError,
  EmptyContentError,
  EntryExistsError,
  InvalidMoveError,
} from '../../../src/server/storage/primitives/store-errors.ts'
import {
  invalidBody,
  payloadTooLarge,
  preconditionRequired,
  toErrorResponse,
} from '../../../src/server/routes/error-response.ts'

const UPLOAD_LIMIT_BYTES = 1024
const LOCK_TIMEOUT_MS = 5000
const ARCHIVE_LIMIT = 100
const ARCHIVE_MEASURED = 150
const HTTP_INTERNAL_ERROR = 500

let lines: string[] = []

interface Refusal {
  status: number
  body: unknown
}

async function refusing(answer: (c: Parameters<typeof invalidBody>[0]) => Response): Promise<Refusal> {
  const app = new Hono()
  app.get('/refused', (c) => answer(c))
  const response = await app.request('/refused')

  return { status: response.status, body: await response.json() }
}

async function refusedFor(error: unknown): Promise<Refusal> {
  return await refusing((c) => toErrorResponse(c, error))
}

async function capture(work: () => Promise<void>): Promise<string> {
  lines.push(...(await loggedDuring(work)))

  return lines.join('\n')
}

beforeEach(() => {
  lines = []
})

describe('refusing a request outright', () => {
  it('reports a body the schema would not take', async () => {
    expect(await refusing(invalidBody)).toStrictEqual({
      status: 400,
      body: { error: 'Invalid request body', code: 'BAD_REQUEST' },
    })
  })

  it('reports a save that sent no validator, rather than letting it overwrite blind', async () => {
    expect(await refusing(preconditionRequired)).toStrictEqual({
      status: 428,
      body: { error: 'If-Match is required', code: 'PRECONDITION_REQUIRED' },
    })
  })

  it('names the limit an upload went past, so the reader learns what would fit', async () => {
    expect(await refusing((c) => payloadTooLarge(c, UPLOAD_LIMIT_BYTES))).toStrictEqual({
      status: 413,
      body: { error: `Upload exceeds ${String(UPLOAD_LIMIT_BYTES)} bytes`, code: 'TOO_LARGE' },
    })
  })
})

describe('turning a store failure into an answer the client can act on', () => {
  it('reads a path the store refused as a bad request', async () => {
    expect(await refusedFor(new InvalidPathError('../x', 'escapes the store'))).toStrictEqual({
      status: 400,
      body: { error: 'Invalid path', code: 'INVALID_PATH' },
    })
  })

  it('reads an absent document as not found', async () => {
    expect(await refusedFor(new DocumentNotFoundError('gone.md'))).toStrictEqual({
      status: 404,
      body: { error: 'Document not found', code: 'NOT_FOUND' },
    })
  })

  it('reads a name already taken as a conflict', async () => {
    expect(await refusedFor(new EntryExistsError('notes.md'))).toStrictEqual({
      status: 409,
      body: { error: 'Already exists', code: 'ALREADY_EXISTS' },
    })
  })

  it('reads a stale validator as a failed precondition, which is what lets the editor offer to reload', async () => {
    expect(await refusedFor(new ConcurrentModificationError('notes.md'))).toStrictEqual({
      status: 412,
      body: { error: 'Document changed since it was loaded', code: 'CONFLICT' },
    })
  })

  it('reads an empty save as unprocessable', async () => {
    expect(await refusedFor(new EmptyContentError('notes.md'))).toStrictEqual({
      status: 422,
      body: { error: 'Content must not be empty', code: 'EMPTY_CONTENT' },
    })
  })

  it('says what the bytes actually were when they contradict the extension', async () => {
    expect(await refusedFor(new ContentMismatchError('photo.png', 'image/jpeg'))).toStrictEqual({
      status: 400,
      body: { error: 'Content does not match the file extension', code: 'CONTENT_MISMATCH', detected: 'image/jpeg' },
    })
  })

  it('enumerates the paths a restore would have overwritten, so the dialog can show them', async () => {
    const blocked = new BlockedRestoreError(['a.md', 'b.md'])

    expect(await refusedFor(blocked)).toStrictEqual({
      status: 409,
      body: { error: blocked.message, code: 'ALREADY_EXISTS', paths: ['a.md', 'b.md'] },
    })
  })

  it('reads a folder moved into its own descendant as a conflict of its own kind', async () => {
    const nonsense = new InvalidMoveError('journal', 'journal/2026')

    expect(await refusedFor(nonsense)).toStrictEqual({
      status: 409,
      body: { error: nonsense.message, code: 'INVALID_MOVE' },
    })
  })

  it('reports which archive limit was passed and by how much, before any bytes are streamed', async () => {
    const tooBig = new ArchiveTooLargeError('bytes', ARCHIVE_LIMIT, ARCHIVE_MEASURED)

    expect(await refusedFor(tooBig)).toStrictEqual({
      status: 413,
      body: {
        error: tooBig.message,
        code: 'TOO_LARGE',
        unit: 'bytes',
        limit: ARCHIVE_LIMIT,
        measured: ARCHIVE_MEASURED,
      },
    })
  })

  it('reads a write that waited too long as busy rather than broken', async () => {
    expect(await refusedFor(new LockTimeoutError(LOCK_TIMEOUT_MS))).toStrictEqual({
      status: 503,
      body: { error: 'Busy, try again', code: 'BUSY' },
    })
  })

  it('tells a busy client when to come back, so it does not retry immediately', async () => {
    const app = new Hono()
    app.get('/refused', (c) => toErrorResponse(c, new LockTimeoutError(LOCK_TIMEOUT_MS)))

    const response = await app.request('/refused')

    expect(response.headers.get('retry-after')).toBe('1')
  })

  it('rethrows a failure it has no answer for, rather than dressing it as a refusal', async () => {
    const unrecognised = new Error('something else entirely')
    let reached: unknown = null
    const app = new Hono()
    app.get('/refused', (c) => toErrorResponse(c, unrecognised))
    app.onError((error, c) => {
      reached = error

      return c.body(null, HTTP_INTERNAL_ERROR)
    })

    await app.request('/refused')

    expect(reached).toBe(unrecognised)
  })
})

describe('a refused request leaves a trace on the server', () => {
  it('records a refusal the client only ever sees as a status code', async () => {
    const logged = await capture(async () => {
      await refusedFor(new InvalidPathError('../x', 'escapes the store'))
    })

    expect(logged).toContain('INVALID_PATH')
  })

  it('names the method and the path, so the offending request is identifiable', async () => {
    const logged = await capture(async () => {
      await refusedFor(new DocumentNotFoundError('missing.md'))
    })

    expect({
      method: logged.includes('GET'),
      path: logged.includes('/refused'),
      code: logged.includes('NOT_FOUND'),
    }).toStrictEqual({ method: true, path: true, code: true })
  })

  it('records a rejected body as well as a rejected path', async () => {
    const logged = await capture(async () => {
      await refusing(invalidBody)
    })

    expect(logged).toContain('BAD_REQUEST')
  })

  it('records a refusal that answers with its own headers, which takes a different path through the module', async () => {
    const logged = await capture(async () => {
      await refusedFor(new LockTimeoutError(LOCK_TIMEOUT_MS))
    })

    expect(logged).toContain('BUSY')
  })

  it('stays silent when DEBUG is unset, which is the default', async () => {
    applyDebugFilter({})

    await refusedFor(new DocumentNotFoundError('missing.md'))

    expect(lines).toStrictEqual([])
  })
})
