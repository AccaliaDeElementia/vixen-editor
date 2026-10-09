'use sanity'

import { describe, expect, it } from 'vitest'

import { TestOnly } from '../../../src/client/browser/uploads.ts'

const { suggestedName } = TestOnly

describe('the name suggested on a collision', () => {
  it.each([
    ['photo.png', 'photo-1.png'],
    ['notes.md', 'notes-1.md'],
    ['archive.tar.gz', 'archive.tar-1.gz'],
    ['README', 'README-1'],
  ])('suggests %s as %s', (name, expected) => {
    expect(suggestedName(name)).toBe(expected)
  })
})
