'use sanity'

import { describe, expect, it } from 'vitest'

import { isBlank } from '../../src/shared/content.ts'

describe('isBlank', () => {
  it.each([
    ['nothing at all', ''],
    ['spaces', '   '],
    ['a newline', '\n'],
    ['mixed whitespace', ' \t\r\n '],
  ])('treats %s as blank, because the store refuses it', (_name, content) => {
    expect(isBlank(content)).toBe(true)
  })

  it.each([
    ['prose', '# hello'],
    ['a single character', 'x'],
    ['text with surrounding space', '  hello  '],
  ])('treats %s as worth storing', (_name, content) => {
    expect(isBlank(content)).toBe(false)
  })
})
