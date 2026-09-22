'use sanity'

import { describe, expect, it } from 'vitest'

import { asDocumentError, DocumentNotFoundError, hasErrorCode } from '../../../src/server/storage/fs-store.ts'

function errnoError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

describe('hasErrorCode', () => {
  it('matches a listed code', () => {
    expect(hasErrorCode(errnoError('ENOENT'), ['ENOENT'])).toBe(true)
  })

  it('matches one of several listed codes', () => {
    expect(hasErrorCode(errnoError('EISDIR'), ['ENOENT', 'EISDIR'])).toBe(true)
  })

  it('rejects an unlisted code', () => {
    expect(hasErrorCode(errnoError('EACCES'), ['ENOENT'])).toBe(false)
  })

  it('rejects an error with no code', () => {
    expect(hasErrorCode(new Error('plain'), ['ENOENT'])).toBe(false)
  })

  it('rejects an error whose code is not a string', () => {
    expect(hasErrorCode(Object.assign(new Error('odd'), { code: 42 }), ['ENOENT'])).toBe(false)
  })

  it('rejects a non-error value', () => {
    expect(hasErrorCode('ENOENT', ['ENOENT'])).toBe(false)
  })

  it('rejects null', () => {
    expect(hasErrorCode(null, ['ENOENT'])).toBe(false)
  })
})

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
