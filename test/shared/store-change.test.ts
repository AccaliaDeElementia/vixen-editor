'use sanity'

import { describe, expect, it } from 'vitest'

import { changeTouches, isStoreChange } from '../../src/shared/store-change.ts'

const WRITTEN = { kind: 'written', path: 'journal/a.md' } as const
const MOVED = { kind: 'moved', from: 'journal/a.md', to: 'diary/a.md' } as const

describe('recognising what the server said changed', () => {
  it('accepts a path that was written', () => {
    expect(isStoreChange(WRITTEN)).toBe(true)
  })

  it('accepts a path that was removed', () => {
    expect(isStoreChange({ kind: 'removed', path: 'journal/a.md' })).toBe(true)
  })

  it('accepts a move, which names both ends', () => {
    expect(isStoreChange(MOVED)).toBe(true)
  })

  it('refuses a kind this build does not know', () => {
    expect(isStoreChange({ kind: 'renamed', path: 'a.md' })).toBe(false)
  })

  it('refuses a write with no path', () => {
    expect(isStoreChange({ kind: 'written' })).toBe(false)
  })

  it('refuses a move missing the place it went', () => {
    expect(isStoreChange({ kind: 'moved', from: 'a.md' })).toBe(false)
  })

  it('refuses something that is not an object at all', () => {
    expect(isStoreChange('written')).toBe(false)
  })
})

describe('whether a change reaches a document someone has open', () => {
  it('reaches the document that was written', () => {
    expect(changeTouches(WRITTEN, 'journal/a.md')).toBe(true)
  })

  it('leaves a document the write did not name alone', () => {
    expect(changeTouches(WRITTEN, 'notes.md')).toBe(false)
  })

  it('reaches a document inside a folder that was removed', () => {
    expect(changeTouches({ kind: 'removed', path: 'journal' }, 'journal/a.md')).toBe(true)
  })

  it('reaches every document when the whole store is swept, which is what a purge says', () => {
    expect(changeTouches({ kind: 'removed', path: '' }, 'notes.md')).toBe(true)
  })

  it('reaches the document that moved away', () => {
    expect(changeTouches(MOVED, 'journal/a.md')).toBe(true)
  })

  it('reaches the path the move landed on, which may be one someone had open', () => {
    expect(changeTouches(MOVED, 'diary/a.md')).toBe(true)
  })

  it('leaves a document neither end of the move names alone', () => {
    expect(changeTouches(MOVED, 'notes.md')).toBe(false)
  })
})
