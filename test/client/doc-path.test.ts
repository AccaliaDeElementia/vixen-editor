'use sanity'

import { describe, expect, it } from 'vitest'

import { docUrlFor, documentIdFromPath, pathAfterMove } from '../../src/client/doc-path.ts'

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

  it.each([
    ['a space', 'Finding Toy.md'],
    ['a hash, which would otherwise start a fragment', 'a#b.md'],
    ['a question mark, which would otherwise start a query', 'Q?A.md'],
    ['an accented letter', 'caf\u00e9.md'],
    ['an emoji', 'party \u{1F389}.md'],
    ['something that merely looks encoded', '%2e%2e.md'],
  ])('round-trips a name with %s', (_label, name) => {
    expect(documentIdFromPath(docUrlFor(name))).toBe(name)
  })

  it('round-trips through documentIdFromPath', () => {
    expect(documentIdFromPath(docUrlFor('journal/2026/september.md'))).toBe('journal/2026/september.md')
  })
})

// A folder move carries everything beneath it, so the document that is open
// can move without ever being named in the request.
describe('pathAfterMove', () => {
  const RENAME = { from: 'notes.md', to: 'renamed.md' }
  const FOLDER = { from: 'journal', to: 'archive/journal' }

  it('maps the entry that was named', () => {
    expect(pathAfterMove(RENAME, 'notes.md')).toBe('renamed.md')
  })

  it('maps a document carried by a folder move', () => {
    expect(pathAfterMove(FOLDER, 'journal/2026/a.md')).toBe('archive/journal/2026/a.md')
  })

  it('maps the moved folder itself', () => {
    expect(pathAfterMove(FOLDER, 'journal')).toBe('archive/journal')
  })

  it('leaves an unrelated document alone', () => {
    expect(pathAfterMove(FOLDER, 'notes.md')).toBe('notes.md')
  })

  it('leaves a sibling that merely shares a prefix alone', () => {
    expect(pathAfterMove(FOLDER, 'journal2/a.md')).toBe('journal2/a.md')
  })
})
