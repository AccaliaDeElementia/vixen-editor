'use sanity'

import { describe, expect, it } from 'vitest'

import { decodeDestination, encodeDestination } from '../../src/shared/link-syntax.ts'

describe('encodeDestination', () => {
  it.each([
    ['outside angle brackets', false],
    ['inside angle brackets', true],
  ])('leaves a plain path alone %s', (_label, inAngles) => {
    expect(encodeDestination('journal/a.md', inAngles)).toBe('journal/a.md')
  })

  it.each([
    ['encodes a space outside angle brackets', false, 'my%20file.md'],
    ['keeps a space inside them', true, 'my file.md'],
  ])('%s', (_label, inAngles, expected) => {
    expect(encodeDestination('my file.md', inAngles)).toBe(expected)
  })

  it.each([
    ['encodes parentheses outside angle brackets', false, 'a%28b%29.md'],
    ['keeps parentheses inside them', true, 'a(b).md'],
  ])('%s', (_label, inAngles, expected) => {
    expect(encodeDestination('a(b).md', inAngles)).toBe(expected)
  })

  it('encodes angle brackets inside angle brackets', () => {
    expect(encodeDestination('a<b>.md', true)).toBe('a%3Cb%3E.md')
  })

  it('encodes a literal percent, or it would read as the start of an escape', () => {
    expect(encodeDestination('100%.md', false)).toBe('100%25.md')
  })

  it.each([
    ['a bare ampersand, which reads as itself', 'rock & roll.md', 'rock & roll.md'],
    ['one that would read as a character reference', 'a&amp;b.md', 'a%26amp;b.md'],
  ])('encodes %s', (_label, destination, expected) => {
    expect(encodeDestination(destination, true)).toBe(expected)
  })

  it('leaves non-ASCII alone, which is legal and more readable than encoding it', () => {
    expect(encodeDestination('café/🎉.md', false)).toBe('café/🎉.md')
  })
})

describe('an encoded percent survives the decoder', () => {
  it('round-trips, so a literal percent in a name is not lost', () => {
    expect(decodeDestination(encodeDestination('100%.md', false))).toBe('100%.md')
  })
})

describe('decodeDestination', () => {
  it('leaves a plain path alone', () => {
    expect(decodeDestination('journal/a.md')).toBe('journal/a.md')
  })

  it('decodes a percent-encoded space', () => {
    expect(decodeDestination('my%20file.md')).toBe('my file.md')
  })

  it('decodes a multi-byte sequence', () => {
    expect(decodeDestination('caf%C3%A9.md')).toBe('café.md')
  })

  it('resolves a backslash escape', () => {
    expect(decodeDestination('a\\(b.md')).toBe('a(b.md')
  })

  it('leaves a lone percent alone', () => {
    expect(decodeDestination('100% done.md')).toBe('100% done.md')
  })

  it('leaves a malformed percent sequence alone', () => {
    expect(decodeDestination('a%zzb.md')).toBe('a%zzb.md')
  })

  it('decodes a valid sequence that sits beside a malformed one', () => {
    expect(decodeDestination('a%20b%zz.md')).toBe('a b%zz.md')
  })

  it('leaves a percent pair that is not valid UTF-8 alone', () => {
    expect(decodeDestination('a%FFb.md')).toBe('a%FFb.md')
  })
})
