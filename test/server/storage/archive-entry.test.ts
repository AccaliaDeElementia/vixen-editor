'use sanity'

import { describe, expect, it } from 'vitest'

import { verdictFor, type ArchiveEntry } from '../../../src/server/storage/archive-entry.ts'

const SOME_BYTES = 12
const UNNAMEABLE = null

function entry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return { name: 'journal/a.md', kind: 'file', declaredBytes: SOME_BYTES, encrypted: false, ...overrides }
}

describe('an entry the store can take', () => {
  it('is imported when it names a document the store allows', () => {
    expect(verdictFor(entry())).toStrictEqual({ decision: 'import' })
  })

  it('is imported when it names an image, because an upload could have made one', () => {
    expect(verdictFor(entry({ name: 'journal/photo.png' }))).toStrictEqual({ decision: 'import' })
  })
})

describe('an entry that is not a file', () => {
  it('ignores a directory, because a folder exists only where a document does', () => {
    expect(verdictFor(entry({ kind: 'directory', name: 'journal/' }))).toStrictEqual({ decision: 'ignore' })
  })

  it('refuses anything else, which is every symlink, device and pipe at once', () => {
    expect(verdictFor(entry({ kind: 'other', name: 'journal/link' })).decision).toBe('refuse')
  })

  it('says what it refused it for, so the reader is told which entry and why', () => {
    expect(verdictFor(entry({ kind: 'other' }))).toStrictEqual({
      decision: 'refuse',
      reason: 'journal/a.md is not a regular file',
    })
  })
})

describe('an entry the archive encrypted', () => {
  it('is refused, because there is nowhere to ask for a passphrase', () => {
    expect(verdictFor(entry({ encrypted: true })).decision).toBe('refuse')
  })
})

describe('an entry the reader could not name', () => {
  it('is refused rather than guessed at', () => {
    expect(verdictFor(entry({ name: UNNAMEABLE })).decision).toBe('refuse')
  })
})

describe('a name the store would not accept', () => {
  it.each([
    ['../../../etc/evil.md', 'a traversal'],
    ['/absolute.md', 'an absolute path'],
    ['back\\slash.md', 'a backslash'],
    ['.hidden.md', 'a leading dot'],
    ['journal//a.md', 'an empty segment'],
    ['journal/a.exe', 'an extension no upload may create'],
    ['journal/ a.md', 'leading whitespace'],
  ])('refuses %s, which is %s', (name) => {
    expect(verdictFor(entry({ name })).decision).toBe('refuse')
  })

  it('refuses a name that is not in normal form, so one path cannot have two spellings', () => {
    expect(verdictFor(entry({ name: 'journal/café.md' })).decision).toBe('refuse')
  })
})
