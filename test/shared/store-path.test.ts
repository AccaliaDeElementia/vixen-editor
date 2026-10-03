'use sanity'

import { describe, expect, it } from 'vitest'

import { isAtOrUnder, joinPath, STORE_ROOT } from '../../src/shared/store-path.ts'

describe('STORE_ROOT', () => {
  it('is how the root of the store is addressed', () => {
    expect(STORE_ROOT).toBe('')
  })

  it('is what a top-level entry joins onto, so its path carries no separator', () => {
    expect(joinPath(STORE_ROOT, 'notes.md')).toBe('notes.md')
  })
})

describe('joinPath', () => {
  it('joins a name onto a directory', () => {
    expect(joinPath('archive', 'notes.md')).toBe('archive/notes.md')
  })

  it('joins onto a nested directory', () => {
    expect(joinPath('journal/2026', 'a.md')).toBe('journal/2026/a.md')
  })

  it('leaves a name at the root unprefixed, which is what both sides relied on separately', () => {
    expect(joinPath(STORE_ROOT, 'notes.md')).toBe('notes.md')
  })
})

describe('isAtOrUnder', () => {
  it('holds for the entry itself', () => {
    expect(isAtOrUnder('journal', 'journal')).toBe(true)
  })

  it('holds for something directly inside it', () => {
    expect(isAtOrUnder('journal', 'journal/a.md')).toBe(true)
  })

  it('holds however deep the entry sits', () => {
    expect(isAtOrUnder('journal', 'journal/2026/march/a.md')).toBe(true)
  })

  it('does not hold for a sibling whose name merely starts the same', () => {
    expect(isAtOrUnder('journal', 'journal-archive/a.md')).toBe(false)
  })

  it('does not hold the other way round', () => {
    expect(isAtOrUnder('journal/a.md', 'journal')).toBe(false)
  })

  it('holds for anything at all under the store root', () => {
    expect(isAtOrUnder(STORE_ROOT, 'journal/a.md')).toBe(true)
  })
})
