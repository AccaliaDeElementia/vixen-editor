'use sanity'

import { describe, expect, it } from 'vitest'

import { documentNameFor } from '../../../src/client/files/document-name.ts'

describe('the name a new document gets', () => {
  it.each([
    ['notes', 'notes.md'],
    ['notes.md', 'notes.md'],
    ['notes.txt', 'notes.txt'],
    ['NOTES.MD', 'NOTES.MD'],
    ['notes.md.md', 'notes.md.md'],
    ['photo.png', 'photo.png.md'],
    ['v1.2', 'v1.2.md'],
    ['journal/notes', 'journal/notes.md'],
  ])('turns %s into %s', (typed, created) => {
    expect(documentNameFor(typed)).toBe(created)
  })

  it('stays empty while nothing has been typed, so there is nothing to promise yet', () => {
    expect(documentNameFor('')).toBe('')
  })
})
