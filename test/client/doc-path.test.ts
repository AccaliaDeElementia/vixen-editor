'use sanity'

import { describe, expect, it } from 'vitest'

import {
  displayPathFromPath,
  docUrlFor,
  documentIdFromPath,
  folderIndexAlternateFromPath,
  TestOnly as docPathTestOnly,
  pathAfterMove,
  titleFor,
} from '../../src/client/doc-path.ts'

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

describe('displayPathFromPath', () => {
  it.each([
    ['/doc/notes.md', 'notes.md'],
    ['/doc/journal/a.md', 'journal/a.md'],
    ['/doc/journal/', 'journal'],
    ['/doc/journal/2026/', 'journal/2026'],
    ['/doc/', ''],
    ['/doc/photo.png', 'photo.png'],
  ])('reads %s as %s, the path as the user sees it', (pathname, expected) => {
    expect(displayPathFromPath(pathname)).toBe(expected)
  })

  it('does not append the folder index the loader needs', () => {
    expect(displayPathFromPath('/doc/journal/')).not.toContain('index.md')
  })
})

const { namesFolderIndex } = docPathTestOnly

describe('namesFolderIndex', () => {
  it('is true for a folder url, which may legitimately have no index yet', () => {
    expect(namesFolderIndex('/doc/journal/')).toBe(true)
  })

  it('is true at the doc root', () => {
    expect(namesFolderIndex('/doc/')).toBe(true)
  })

  it('is false for a named document, so a typo is reported rather than created', () => {
    expect(namesFolderIndex('/doc/journal/a.md')).toBe(false)
  })
})

describe('titleFor', () => {
  it.each([
    ['notes.md', 'notes.md'],
    ['journal/a.md', 'journal/a.md'],
    ['journal/2026/a.md', '2026/a.md'],
    ['journal', 'journal'],
    ['journal/2026', 'journal/2026'],
    ['photo.png', 'photo.png'],
  ])('titles %s as %s', (displayPath, expected) => {
    expect(titleFor(displayPath)).toBe(expected)
  })

  it('keeps the extension, because notes.md and notes.txt are different documents', () => {
    expect(titleFor('notes.txt')).toBe('notes.txt')
  })

  it('grows no further than two segments, however deep the path', () => {
    expect(titleFor('a/b/c/d/e.md')).toBe('d/e.md')
  })

  it('has nothing to say at the store root, so the rendered title stands', () => {
    expect(titleFor('')).toBe('')
  })
})

describe('folderIndexAlternateFromPath', () => {
  it('names the other index a folder url could mean', () => {
    expect(folderIndexAlternateFromPath('/doc/journal/')).toBe('journal/index.txt')
  })

  it('names the one at the store root', () => {
    expect(folderIndexAlternateFromPath('/doc/')).toBe('index.txt')
  })

  it('offers nothing for a url that already names a document', () => {
    expect(folderIndexAlternateFromPath('/doc/journal/a.md')).toBeNull()
  })
})
