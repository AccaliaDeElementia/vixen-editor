'use sanity'

import { describe, expect, it } from 'vitest'

import { encodeDestination } from '../../src/shared/link-syntax.ts'

describe('encodeDestination', () => {
  it('leaves a plain path alone in either form', () => {
    expect(encodeDestination('journal/a.md', false)).toBe('journal/a.md')
    expect(encodeDestination('journal/a.md', true)).toBe('journal/a.md')
  })

  it('encodes a space outside angle brackets and keeps it inside them', () => {
    expect(encodeDestination('my file.md', false)).toBe('my%20file.md')
    expect(encodeDestination('my file.md', true)).toBe('my file.md')
  })

  it('encodes parentheses outside angle brackets and keeps them inside', () => {
    expect(encodeDestination('a(b).md', false)).toBe('a%28b%29.md')
    expect(encodeDestination('a(b).md', true)).toBe('a(b).md')
  })

  it('encodes angle brackets inside angle brackets', () => {
    expect(encodeDestination('a<b>.md', true)).toBe('a%3Cb%3E.md')
  })

  it('encodes a literal percent, or it would read as the start of an escape', () => {
    expect(encodeDestination('100%.md', false)).toBe('100%25.md')
  })

  it('encodes an ampersand only when it would read as a character reference', () => {
    expect(encodeDestination('rock & roll.md', true)).toBe('rock & roll.md')
    expect(encodeDestination('a&amp;b.md', true)).toBe('a%26amp;b.md')
  })

  it('leaves non-ASCII alone, which is legal and more readable than encoding it', () => {
    expect(encodeDestination('café/🎉.md', false)).toBe('café/🎉.md')
  })
})
