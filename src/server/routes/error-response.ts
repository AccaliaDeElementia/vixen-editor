'use sanity'

import type { Context } from 'hono'

import { toError } from '../errors.ts'
import { DocumentNotFoundError, EntryExistsError } from '../storage/fs-store.ts'
import { InvalidPathError } from '../storage/safe-path.ts'

const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE_CONTENT = 422

export function invalidBody(c: Context): Response {
  return c.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, HTTP_BAD_REQUEST)
}

export function emptyContent(c: Context): Response {
  return c.json({ error: 'Content must not be empty', code: 'EMPTY_CONTENT' }, HTTP_UNPROCESSABLE_CONTENT)
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

  throw toError(error)
}
