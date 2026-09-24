'use sanity'

import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { toError } from '../errors.ts'
import { createLogger } from '../logging.ts'
import { LockTimeoutError } from '../storage/lock.ts'
import { InvalidPathError } from '../storage/safe-path.ts'
import {
  ArchiveTooLargeError,
  ConcurrentModificationError,
  ContentMismatchError,
  DocumentNotFoundError,
  EmptyContentError,
  EntryExistsError,
  InvalidMoveError,
  WouldOverwriteError,
} from '../storage/store-errors.ts'

const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_PRECONDITION_FAILED = 412
const HTTP_UNPROCESSABLE_CONTENT = 422
const HTTP_CONTENT_TOO_LARGE = 413
const HTTP_PRECONDITION_REQUIRED = 428
const HTTP_SERVICE_UNAVAILABLE = 503

const RETRY_AFTER_SECONDS = '1'

const logRefused = createLogger('routes', 'refused')

function refuse(c: Context, status: ContentfulStatusCode, code: string, body: Record<string, unknown>): Response {
  logRefused('%s %s -> %d %s', c.req.method, c.req.path, status, code)

  return c.json({ ...body, code }, status)
}

export function invalidBody(c: Context): Response {
  return refuse(c, HTTP_BAD_REQUEST, 'BAD_REQUEST', { error: 'Invalid request body' })
}

export function preconditionRequired(c: Context): Response {
  return refuse(c, HTTP_PRECONDITION_REQUIRED, 'PRECONDITION_REQUIRED', { error: 'If-Match is required' })
}

export function payloadTooLarge(c: Context, limitBytes: number): Response {
  return refuse(c, HTTP_CONTENT_TOO_LARGE, 'TOO_LARGE', { error: `Upload exceeds ${String(limitBytes)} bytes` })
}

interface SimpleMapping {
  type: abstract new (...args: never[]) => Error
  status: ContentfulStatusCode
  code: string
  message: string
}

// Errors whose response is nothing but a status and a code. The few that carry
// extra fields stay spelled out below, where their shape is visible.
const SIMPLE_ERRORS: readonly SimpleMapping[] = [
  { type: InvalidPathError, status: HTTP_BAD_REQUEST, code: 'INVALID_PATH', message: 'Invalid path' },
  { type: DocumentNotFoundError, status: HTTP_NOT_FOUND, code: 'NOT_FOUND', message: 'Document not found' },
  { type: EntryExistsError, status: HTTP_CONFLICT, code: 'ALREADY_EXISTS', message: 'Already exists' },
  {
    type: ConcurrentModificationError,
    status: HTTP_PRECONDITION_FAILED,
    code: 'CONFLICT',
    message: 'Document changed since it was loaded',
  },
  {
    type: ContentMismatchError,
    status: HTTP_BAD_REQUEST,
    code: 'CONTENT_MISMATCH',
    message: 'Content does not match the file extension',
  },
  {
    type: EmptyContentError,
    status: HTTP_UNPROCESSABLE_CONTENT,
    code: 'EMPTY_CONTENT',
    message: 'Content must not be empty',
  },
]

export function toErrorResponse(c: Context, error: unknown): Response {
  const simple = SIMPLE_ERRORS.find(({ type }) => error instanceof type)
  if (simple !== undefined) return refuse(c, simple.status, simple.code, { error: simple.message })

  if (error instanceof InvalidMoveError) {
    return refuse(c, HTTP_CONFLICT, 'INVALID_MOVE', { error: error.message })
  }
  if (error instanceof WouldOverwriteError) {
    return refuse(c, HTTP_CONFLICT, 'WOULD_OVERWRITE', {
      error: 'Would overwrite existing files',
      paths: error.paths,
    })
  }
  if (error instanceof ArchiveTooLargeError) {
    return refuse(c, HTTP_CONTENT_TOO_LARGE, 'TOO_LARGE', {
      error: error.message,
      unit: error.unit,
      limit: error.limit,
      measured: error.measured,
    })
  }
  if (error instanceof LockTimeoutError) {
    logRefused('%s %s -> %d %s', c.req.method, c.req.path, HTTP_SERVICE_UNAVAILABLE, 'BUSY')

    return c.json({ error: 'Busy, try again', code: 'BUSY' }, HTTP_SERVICE_UNAVAILABLE, {
      'retry-after': RETRY_AFTER_SECONDS,
    })
  }

  throw toError(error)
}
