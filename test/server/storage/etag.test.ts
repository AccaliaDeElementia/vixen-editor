'use sanity'

import { describe, expect, it } from 'vitest'

import { computeEtag } from '../../../src/server/storage/etag.ts'

describe('computeEtag', () => {
  it('is stable for the same content', () => {
    expect(computeEtag('# hello')).toBe(computeEtag('# hello'))
  })

  it('differs for different content', () => {
    expect(computeEtag('# hello')).not.toBe(computeEtag('# hellp'))
  })

  it('notices a whitespace-only change, which a length or mtime check would miss', () => {
    expect(computeEtag('a b')).not.toBe(computeEtag('a  b'))
  })

  it('distinguishes content of the same length', () => {
    expect(computeEtag('ab')).not.toBe(computeEtag('ba'))
  })

  it('handles empty content', () => {
    expect(computeEtag('')).not.toBe(computeEtag(' '))
  })

  it('is a quoted strong validator, as HTTP requires of an ETag', () => {
    expect(computeEtag('# hello')).toMatch(/^"[0-9a-f]{64}"$/u)
  })

  it('distinguishes unicode content that differs only in normalisation', () => {
    expect(computeEtag('café')).not.toBe(computeEtag('café'))
  })
})
