'use sanity'

import { describe, expect, it } from 'vitest'

import {
  asDocumentError,
  ContentMismatchError,
  DocumentNotFoundError,
} from '../../../../src/server/storage/primitives/store-errors.ts'

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

describe('ContentMismatchError', () => {
  it('names the format the bytes turned out to be', () => {
    expect(new ContentMismatchError('photo.png', 'webp').message).toContain('looks like a webp file')
  })

  it('says the bytes are no image at all when nothing recognised them', () => {
    expect(new ContentMismatchError('photo.png', null).message).toContain('is not a recognised image')
  })
})
