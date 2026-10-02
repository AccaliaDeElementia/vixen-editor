'use sanity'

import { describe, expect, it } from 'vitest'

import { hasErrorCode, toError } from '../../src/server/node-errors.ts'

function errnoError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

describe('toError', () => {
  it('passes an Error through unchanged, preserving its stack', () => {
    const original = new Error('boom')

    expect(toError(original)).toBe(original)
  })

  it('preserves an Error subclass', () => {
    const original = new TypeError('bad type')

    expect(toError(original)).toBeInstanceOf(TypeError)
  })

  it('wraps a thrown string', () => {
    expect(toError('just a string')).toBeInstanceOf(Error)
  })

  it('keeps the thrown value in the wrapped message', () => {
    expect(toError('just a string').message).toBe('just a string')
  })

  it('wraps a thrown non-string primitive', () => {
    expect(toError(42).message).toBe('42')
  })

  it('wraps null', () => {
    expect(toError(null).message).toBe('null')
  })
})

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
