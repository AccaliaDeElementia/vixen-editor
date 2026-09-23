'use sanity'

import { describe, expect, it } from 'vitest'

import { docUrlFor, documentIdFromPath } from '../../src/client/doc-path.ts'

describe('documentIdFromPath', () => {
  it('reads the document from the path', () => {
    expect(documentIdFromPath('/doc/journal/2026.md')).toBe('journal/2026.md')
  })

  it('reads a flat document', () => {
    expect(documentIdFromPath('/doc/notes.md')).toBe('notes.md')
  })

  it('falls back to the folder index at the doc root', () => {
    expect(documentIdFromPath('/doc/')).toBe('index.md')
  })

  it('falls back to the folder index inside a folder', () => {
    expect(documentIdFromPath('/doc/journal/')).toBe('journal/index.md')
  })

  it('decodes a percent-encoded segment', () => {
    expect(documentIdFromPath('/doc/journal/a%2Db.md')).toBe('journal/a-b.md')
  })

  it('keeps a malformed escape rather than throwing on a hand-typed url', () => {
    expect(documentIdFromPath('/doc/a%zz.md')).toBe('a%zz.md')
  })

  it('treats a path outside the doc prefix as the root', () => {
    expect(documentIdFromPath('/elsewhere')).toBe('index.md')
  })
})

describe('docUrlFor', () => {
  it('builds the url for a flat document', () => {
    expect(docUrlFor('notes.md')).toBe('/doc/notes.md')
  })

  it('builds the url for a nested document', () => {
    expect(docUrlFor('journal/2026/september.md')).toBe('/doc/journal/2026/september.md')
  })

  it('encodes a segment without encoding the separators', () => {
    expect(docUrlFor('my folder/a b.md')).toBe('/doc/my%20folder/a%20b.md')
  })

  it('round-trips through documentIdFromPath', () => {
    expect(documentIdFromPath(docUrlFor('journal/2026/september.md'))).toBe('journal/2026/september.md')
  })
})
