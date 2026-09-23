'use sanity'

import type { Context } from 'hono'

import { toError } from '../errors.ts'
import {
  ConcurrentModificationError,
  DocumentNotFoundError,
  EmptyContentError,
  EntryExistsError,
} from '../storage/fs-store.ts'
import { LockTimeoutError } from '../storage/lock.ts'
import { InvalidPathError } from '../storage/safe-path.ts'

const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_PRECONDITION_FAILED = 412
const HTTP_UNPROCESSABLE_CONTENT = 422
const HTTP_PRECONDITION_REQUIRED = 428
const HTTP_SERVICE_UNAVAILABLE = 503

export const RETRY_AFTER_SECONDS = '1'

export function invalidBody(c: Context): Response {
  return c.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, HTTP_BAD_REQUEST)
}

export function preconditionRequired(c: Context): Response {
  return c.json({ error: 'If-Match is required', code: 'PRECONDITION_REQUIRED' }, HTTP_PRECONDITION_REQUIRED)
}

export function toErrorResponse(c: Context, error: unknown): Response {
  if (error instanceof InvalidPathError) {
    return c.json({ error: 'Invalid path', code: 'INVALID_PATH' }, HTTP_BAD_REQUEST)
  }
  if (error instanceof DocumentNotFoundError) {
    return c.json({ error: 'Document not found', code: 'NOT_FOUND' }, HTTP_NOT_FOUND)
  }
  if (error instanceof EntryExistsError) {
    return c.json({ error: 'Already exists', code: 'ALREADY_EXISTS' }, HTTP_CONFLICT)
  }
  if (error instanceof ConcurrentModificationError) {
    return c.json({ error: 'Document changed since it was loaded', code: 'CONFLICT' }, HTTP_PRECONDITION_FAILED)
  }
  if (error instanceof EmptyContentError) {
    return c.json({ error: 'Content must not be empty', code: 'EMPTY_CONTENT' }, HTTP_UNPROCESSABLE_CONTENT)
  }
  if (error instanceof LockTimeoutError) {
    return c.json({ error: 'Busy, try again', code: 'BUSY' }, HTTP_SERVICE_UNAVAILABLE, {
      'retry-after': RETRY_AFTER_SECONDS,
    })
  }

  throw toError(error)
}
