'use sanity'

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_EXTENSIONS,
  extensionOf,
  IMAGE_EXTENSIONS,
  InvalidPathError,
  joinEntryPath,
  resolveDocumentPath,
  resolveEntryPath,
  resolveFolderPath,
} from '../../../src/server/storage/safe-path.ts'

const ROOT = '/srv/vixen/docs'

const REJECTED_FOLDER_PATHS: ReadonlyArray<readonly [string, string]> = [
  ['a parent segment', '../secrets'],
  ['a nested parent segment', 'notes/../../secrets'],
  ['a trailing parent segment', 'notes/..'],
  ['a bare parent segment', '..'],
  ['a current-directory segment', './notes'],
  ['a deep escape', '../../../../etc/passwd'],
  ['an absolute posix path', '/etc/passwd'],
  ['an absolute path inside root', `${ROOT}/notes`],
  ['a windows drive path', 'C:\\windows\\system32'],
  ['a backslash separator', 'notes\\..\\..\\secrets'],
  ['a leading slash', '/notes'],
  ['a double slash', 'notes//secrets'],
  ['a home-relative path', '~/secrets'],
  ['whitespace only', '   '],
  ['a null byte', 'notes\u0000'],
  ['a null byte before a separator', 'notes\u0000/evil'],
  ['a newline', 'notes\n'],
  ['a URL-encoded traversal', '%2e%2e/secrets'],
  ['a space in the name', 'my notes'],
  ['a trailing slash', 'notes/'],
  ['a control character', 'notes\u0007'],
]

describe('extensionOf', () => {
  it.each([
    ['a simple extension', 'notes.md', '.md'],
    ['the last of several dots', 'release.notes.md', '.md'],
    ['a nested path', 'journal/2026/photo.png', '.png'],
    ['no extension at all', 'notes', ''],
    ['an uppercase extension, folded down', 'PHOTO.PNG', '.png'],
    ['a mixed-case extension, folded down', 'Notes.Md', '.md'],
  ])('%s', (_label, value, expected) => {
    expect(extensionOf(value)).toBe(expected)
  })
})

describe('resolveDocumentPath', () => {
  describe('accepts legitimate document ids', () => {
    it.each([
      ['a flat file', 'notes.md'],
      ['a nested file', 'journal/2026/september.md'],
      ['hyphens and underscores', 'my-notes_v2.md'],
      ['digits', '2026.md'],
      ['a dot inside the name', 'release.notes.md'],
      ['a plain text document', 'notes.txt'],
      ['an uppercase extension', 'NOTES.MD'],
    ])('%s', (_label, id) => {
      expect(resolveDocumentPath(ROOT, id)).toBe(path.join(ROOT, id))
    })

    it('returns an absolute path even when the root is relative', () => {
      expect(path.isAbsolute(resolveDocumentPath('./data/docs', 'notes.md'))).toBe(true)
    })

    it('keeps the resolved path inside the root', () => {
      const resolved = resolveDocumentPath(ROOT, 'deeply/nested/file.md')
      expect(resolved.startsWith(`${ROOT}${path.sep}`)).toBe(true)
    })
  })

  describe('rejects traversal and malformed ids', () => {
    it.each([
      ['a parent segment', '../secrets.md'],
      ['a nested parent segment', 'notes/../../secrets.md'],
      ['a trailing parent segment', 'notes/..'],
      ['a bare parent segment', '..'],
      ['a current-directory segment', './notes.md'],
      ['a deep escape', '../../../../etc/passwd.md'],
      ['an absolute posix path', '/etc/passwd.md'],
      ['an absolute path inside root', `${ROOT}/notes.md`],
      ['a windows drive path', 'C:\\windows\\system32.md'],
      ['a backslash separator', 'notes\\..\\..\\secrets.md'],
      ['a leading slash', '/notes.md'],
      ['a double slash', 'notes//secrets.md'],
      ['a home-relative path', '~/secrets.md'],
      ['an empty id', ''],
      ['whitespace only', '   '],
      ['a null byte', 'notes\u0000.md'],
      ['a null byte before the extension', 'notes\u0000/evil.md'],
      ['a newline', 'notes\n.md'],
      ['a URL-encoded traversal', '%2e%2e/secrets.md'],
      ['a space in the name', 'my notes.md'],
      ['a trailing slash', 'notes/'],
      ['a control character', 'notes\u0007.md'],
      ['a missing extension', 'notes'],
      ['an image extension', 'photo.png'],
      ['an unlisted extension', 'archive.zip'],
      ['an extension only', '.md'],
      ['an empty nested segment', 'journal//2026.md'],
    ])('%s', (_label, id) => {
      expect(() => resolveDocumentPath(ROOT, id)).toThrow(InvalidPathError)
    })
  })

  describe('rejects segments beginning with a dot', () => {
    it('rejects the trash directory, which is not addressable through the document API', () => {
      expect(() => resolveDocumentPath(ROOT, '.trash/evil.md')).toThrow(InvalidPathError)
    })

    it('rejects a hidden document, which the listing would never show again', () => {
      expect(() => resolveDocumentPath(ROOT, '.hidden.md')).toThrow(InvalidPathError)
    })

    it('rejects a hidden document nested under a visible folder', () => {
      expect(() => resolveDocumentPath(ROOT, 'journal/.secret.md')).toThrow(InvalidPathError)
    })

    it('rejects a document inside a hidden folder', () => {
      expect(() => resolveDocumentPath(ROOT, '.git/config.md')).toThrow(InvalidPathError)
    })
  })

  it('reports the rejected id in the error message', () => {
    expect(() => resolveDocumentPath(ROOT, '../secrets.md')).toThrow(/\.\.\/secrets\.md/)
  })

  it('does not disclose the document root in the error message reachable by a caller', () => {
    try {
      resolveDocumentPath(ROOT, '../secrets.md')
      expect.unreachable('expected resolveDocumentPath to throw')
    } catch (error) {
      expect((error as Error).message).not.toContain(ROOT)
    }
  })
})

describe('resolveEntryPath', () => {
  it('accepts an extension from the list it was given', () => {
    expect(resolveEntryPath(ROOT, 'journal/photo.png', IMAGE_EXTENSIONS)).toBe(path.join(ROOT, 'journal/photo.png'))
  })

  it('rejects an extension from a different family', () => {
    expect(() => resolveEntryPath(ROOT, 'notes.md', IMAGE_EXTENSIONS)).toThrow(InvalidPathError)
  })

  it('names the permitted extensions in the error', () => {
    expect(() => resolveEntryPath(ROOT, 'notes.zip', DOCUMENT_EXTENSIONS)).toThrow(/\.md/)
  })

  it('accepts every listed image extension', () => {
    for (const extension of IMAGE_EXTENSIONS) {
      expect(resolveEntryPath(ROOT, `photo${extension}`, IMAGE_EXTENSIONS)).toBe(path.join(ROOT, `photo${extension}`))
    }
  })
})

describe('resolveFolderPath', () => {
  describe('accepts legitimate folder paths', () => {
    it.each([
      ['a flat folder', 'journal'],
      ['a nested folder', 'journal/2026/september'],
      ['a folder with a dot in the name', 'v1.2'],
      ['hyphens and underscores', 'my-folder_v2'],
    ])('%s', (_label, folder) => {
      expect(resolveFolderPath(ROOT, folder)).toBe(path.join(ROOT, folder))
    })

    it('treats the empty path as the root itself, which is where a rootless selection targets', () => {
      expect(resolveFolderPath(ROOT, '')).toBe(path.resolve(ROOT))
    })

    it('needs no extension, unlike an entry', () => {
      expect(resolveFolderPath(ROOT, 'notes')).toBe(path.join(ROOT, 'notes'))
    })
  })

  describe('rejects traversal and malformed paths', () => {
    it.each(REJECTED_FOLDER_PATHS)('%s', (_label, folder) => {
      expect(() => resolveFolderPath(ROOT, folder)).toThrow(InvalidPathError)
    })

    it('rejects the trash directory, so it cannot be created or written through the API', () => {
      expect(() => resolveFolderPath(ROOT, '.trash')).toThrow(InvalidPathError)
    })

    it('rejects a hidden folder nested under a visible one', () => {
      expect(() => resolveFolderPath(ROOT, 'journal/.git')).toThrow(InvalidPathError)
    })
  })
})

describe('joinEntryPath', () => {
  it('joins a name onto a directory', () => {
    expect(joinEntryPath('journal', 'notes.md')).toBe('journal/notes.md')
  })

  it('returns the bare name when the directory is the root', () => {
    expect(joinEntryPath('', 'notes.md')).toBe('notes.md')
  })

  it('joins onto a nested directory', () => {
    expect(joinEntryPath('journal/2026', 'notes.md')).toBe('journal/2026/notes.md')
  })

  it('rejects a name carrying its own separator, which an upload filename must not', () => {
    expect(() => joinEntryPath('journal', 'nested/notes.md')).toThrow(InvalidPathError)
  })

  it('rejects a name that escapes with a separator, before path rules ever see it', () => {
    expect(() => joinEntryPath('journal', '../notes.md')).toThrow(InvalidPathError)
  })
})
