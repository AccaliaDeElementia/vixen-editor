'use sanity'

import { describe, expect, it } from 'vitest'

import { toError } from '../../src/server/errors.ts'

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
