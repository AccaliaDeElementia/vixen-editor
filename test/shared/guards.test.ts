'use sanity'

import { describe, expect, it } from 'vitest'

import { isRecord } from '../../src/shared/guards.ts'

describe('isRecord', () => {
  it.each([
    ['an object literal', {}],
    ['an object with properties', { a: 1 }],
    ['a class instance', new Error('x')],
  ])('accepts %s', (_label, value) => {
    expect(isRecord(value)).toBe(true)
  })

  it.each([
    ['an array', []],
    ['a populated array', [1, 2]],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 1],
  ])('rejects %s', (_label, value) => {
    expect(isRecord(value)).toBe(false)
  })
})
