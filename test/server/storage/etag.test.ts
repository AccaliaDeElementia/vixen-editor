'use sanity'

import { describe, expect, it } from 'vitest'

import { etagOf } from '../../../src/server/storage/etag.ts'

describe('etagOf', () => {
  it('is stable for the same content', () => {
    expect(etagOf('# hello')).toBe(etagOf('# hello'))
  })

  it('differs for different content', () => {
    expect(etagOf('# hello')).not.toBe(etagOf('# hellp'))
  })

  it('notices a whitespace-only change, which a length or mtime check would miss', () => {
    expect(etagOf('a b')).not.toBe(etagOf('a  b'))
  })

  it('distinguishes content of the same length', () => {
    expect(etagOf('ab')).not.toBe(etagOf('ba'))
  })

  it('handles empty content', () => {
    expect(etagOf('')).not.toBe(etagOf(' '))
  })

  it('is a quoted strong validator, as HTTP requires of an ETag', () => {
    expect(etagOf('# hello')).toMatch(/^"[0-9a-f]{64}"$/u)
  })

  it('distinguishes unicode content that differs only in normalisation', () => {
    expect(etagOf('café')).not.toBe(etagOf('café'))
  })
})
