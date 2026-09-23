'use sanity'

import { describe, expect, it } from 'vitest'

import { FALLBACK_MEDIA_TYPE, mediaTypeOf } from '../../../src/server/storage/media-type.ts'

describe('mediaTypeOf', () => {
  it.each([
    ['markdown', 'notes.md', 'text/markdown; charset=utf-8'],
    ['plain text', 'notes.txt', 'text/plain; charset=utf-8'],
    ['png', 'photo.png', 'image/png'],
    ['jpg', 'photo.jpg', 'image/jpeg'],
    ['jpeg', 'photo.jpeg', 'image/jpeg'],
    ['gif', 'photo.gif', 'image/gif'],
    ['webp', 'photo.webp', 'image/webp'],
    ['svg', 'drawing.svg', 'image/svg+xml'],
  ])('maps %s', (_label, entryPath, expected) => {
    expect(mediaTypeOf(entryPath)).toBe(expected)
  })

  it('maps a nested path by its extension', () => {
    expect(mediaTypeOf('journal/2026/photo.png')).toBe('image/png')
  })

  it('folds an uppercase extension', () => {
    expect(mediaTypeOf('PHOTO.PNG')).toBe('image/png')
  })

  it.each([
    ['an unlisted extension', 'archive.zip'],
    ['no extension at all', 'README'],
  ])('falls back to an opaque type for %s, leaving nothing to sniff towards', (_label, entryPath) => {
    expect(mediaTypeOf(entryPath)).toBe(FALLBACK_MEDIA_TYPE)
  })

  it('declares a charset on every text type, so the browser does not guess one', () => {
    expect(mediaTypeOf('notes.md')).toContain('charset=utf-8')
    expect(mediaTypeOf('notes.txt')).toContain('charset=utf-8')
  })
})
