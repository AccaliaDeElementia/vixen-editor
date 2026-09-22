'use sanity'

import { describe, expect, it } from 'vitest'

import { asDocumentError, DocumentNotFoundError } from '../../../src/server/storage/fs-store.ts'

function errnoError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

describe('asDocumentError', () => {
  it('converts a listed code into DocumentNotFoundError', () => {
    expect(asDocumentError('notes.md', errnoError('ENOENT'), ['ENOENT'])).toBeInstanceOf(DocumentNotFoundError)
  })

  it('names the document in the converted error', () => {
    const converted = asDocumentError('notes.md', errnoError('ENOENT'), ['ENOENT'])

    expect(converted.message).toContain('notes.md')
  })

  it('passes EACCES straight through, because unreadable is not the same as absent', () => {
    const permission = errnoError('EACCES')

    expect(asDocumentError('notes.md', permission, ['ENOENT'])).toBe(permission)
  })

  it('passes a non-errno error straight through', () => {
    const boom = new Error('boom')

    expect(asDocumentError('notes.md', boom, ['ENOENT'])).toBe(boom)
  })
})
