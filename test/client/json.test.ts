'use sanity'

import { describe, expect, it } from 'vitest'

import { stringsIn } from '../../src/client/json.ts'

describe('stringsIn', () => {
  it('keeps the strings of an array', () => {
    expect(stringsIn(['a', 'b'])).toStrictEqual(['a', 'b'])
  })

  it('drops the entries that are not strings', () => {
    expect(stringsIn(['a', 1, null, {}, 'b'])).toStrictEqual(['a', 'b'])
  })

  it.each([
    ['a string', 'a'],
    ['an object', { 0: 'a' }],
    ['null', null],
    ['undefined', undefined],
  ])('returns nothing for %s', (_name, value) => {
    expect(stringsIn(value)).toStrictEqual([])
  })
})
