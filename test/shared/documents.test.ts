'use sanity'

import { describe, expect, it } from 'vitest'

import { FOLDER_INDEX_NAME, isEntryKind } from '../../src/shared/documents.ts'

describe('isEntryKind', () => {
  it.each([['document'], ['image'], ['folder']])('accepts %s, which the store can hold', (value) => {
    expect(isEntryKind(value)).toBe(true)
  })

  it.each([
    ['a kind the store does not have', 'symlink'],
    ['the empty string', ''],
    ['a number', 1],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isEntryKind(value)).toBe(false)
  })
})

describe('FOLDER_INDEX_NAME', () => {
  it('is the document a folder url resolves to, and the one a new folder is seeded with', () => {
    expect(FOLDER_INDEX_NAME).toBe('index.md')
  })
})
