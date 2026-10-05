'use sanity'

import { describe, expect, it } from 'vitest'

import { decodeEntity } from '../../src/client/html-entities.ts'

describe('an entity with a name', () => {
  it('decodes one the renderer knows', () => {
    expect(decodeEntity('&amp;')).toBe('&')
  })

  it('leaves one it does not know as written, rather than guessing', () => {
    expect(decodeEntity('&nosuchthing;')).toBe('&nosuchthing;')
  })
})

describe('an entity naming a code point', () => {
  it('decodes a decimal one', () => {
    expect(decodeEntity('&#65;')).toBe('A')
  })

  it('decodes a hexadecimal one', () => {
    expect(decodeEntity('&#x41;')).toBe('A')
  })

  it('accepts an upper-case hex marker', () => {
    expect(decodeEntity('&#X41;')).toBe('A')
  })

  it('leaves a code point above the highest one as written, rather than throwing', () => {
    expect(decodeEntity('&#9999999;')).toBe('&#9999999;')
  })

  it('leaves digits that are not digits as written', () => {
    expect(decodeEntity('&#zz;')).toBe('&#zz;')
  })

  it('leaves a hex marker with nothing after it as written', () => {
    expect(decodeEntity('&#x;')).toBe('&#x;')
  })
})
