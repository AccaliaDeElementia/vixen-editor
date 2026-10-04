'use sanity'

import { describe, expect, it } from 'vitest'

import { isAtOrUnder, joinPath, STORE_ROOT, deepestSharedFolder } from '../../src/shared/store-path.ts'

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

describe('deepestSharedFolder', () => {
  it('is the folder two siblings share', () => {
    expect(deepestSharedFolder(['journal/a.md', 'journal/b.md'])).toBe('journal')
  })

  it('is the store root when the paths diverge at the top', () => {
    expect(deepestSharedFolder(['journal/a.md', 'notes.md'])).toBe('')
  })

  it('stops at the shallower of two paths on the same branch', () => {
    expect(deepestSharedFolder(['journal/2026/a.md', 'journal/b.md'])).toBe('journal')
  })

  it('holds a path within itself, since a folder contains its own contents', () => {
    expect(deepestSharedFolder(['journal/2026', 'journal/2026/a.md'])).toBe('journal/2026')
  })

  it('is the store root once the whole store is in the running', () => {
    expect(deepestSharedFolder(['', 'journal/a.md'])).toBe('')
  })

  it('is the store root for nothing at all', () => {
    expect(deepestSharedFolder([])).toBe('')
  })

  it('does not mistake a name that merely starts the same for a shared folder', () => {
    expect(deepestSharedFolder(['journal/a.md', 'journalism/a.md'])).toBe('')
  })
})
