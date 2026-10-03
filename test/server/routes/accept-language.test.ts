'use sanity'

import { describe, expect, it } from 'vitest'

import { preferredLocale } from '../../../src/server/routes/accept-language.ts'

describe('the locale a client asked for', () => {
  it('is the one it named', () => {
    expect(preferredLocale('sv')).toBe('sv')
  })

  it('keeps the region, because collation differs within a language', () => {
    expect(preferredLocale('fr-CH')).toBe('fr-CH')
  })

  it('is the first of a plain list, which is the order of preference', () => {
    expect(preferredLocale('sv, de, fr')).toBe('sv')
  })

  it('follows the quality values rather than the written order', () => {
    expect(preferredLocale('de;q=0.5, sv;q=0.9')).toBe('sv')
  })

  it('keeps the written order where two weigh the same', () => {
    expect(preferredLocale('de;q=0.8, sv;q=0.8')).toBe('de')
  })

  it('passes over a tag no collator can serve, rather than giving up', () => {
    expect(preferredLocale('zz-ZZ, sv')).toBe('sv')
  })

  it('passes over a tag that is not a tag at all', () => {
    expect(preferredLocale('en_US, sv')).toBe('sv')
  })

  it('ignores the wildcard, which names no locale to sort by', () => {
    expect(preferredLocale('*, sv')).toBe('sv')
  })
})

describe('a request that settles nothing', () => {
  it.each([
    ['no header at all', undefined],
    ['an empty header', ''],
    ['only a wildcard', '*'],
    ['a language nobody collates', 'zz-ZZ'],
    ['a malformed tag', 'not a locale!'],
    ['a tag refused outright', 'sv;q=0'],
    ['a quality that is not a number', 'sv;q=banana'],
  ])('falls back to the host locale given %s', (_case, header) => {
    expect(preferredLocale(header)).toBeUndefined()
  })
})
