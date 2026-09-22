'use sanity'

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { InvalidDocumentIdError, resolveDocumentPath } from '../../../server/storage/safe-path.ts'

const ROOT = '/srv/vixen/docs'

describe('resolveDocumentPath', () => {
  describe('accepts legitimate document ids', () => {
    it.each([
      ['a flat file', 'notes.md'],
      ['a nested file', 'journal/2026/september.md'],
      ['hyphens and underscores', 'my-notes_v2.md'],
      ['digits', '2026.md'],
      ['a dot inside the name', 'release.notes.md'],
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

  describe('rejects traversal attempts', () => {
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
    ])('%s', (_label, id) => {
      expect(() => resolveDocumentPath(ROOT, id)).toThrow(InvalidDocumentIdError)
    })
  })

  describe('rejects malformed ids', () => {
    it.each([
      ['an empty id', ''],
      ['whitespace only', '   '],
      ['a null byte', 'notes\u0000.md'],
      ['a null byte before the extension', 'notes\u0000/evil.md'],
      ['a newline', 'notes\n.md'],
      ['a missing extension', 'notes'],
      ['a non-markdown extension', 'notes.txt'],
      ['an extension only', '.md'],
      ['a URL-encoded traversal', '%2e%2e/secrets.md'],
      ['a space in the name', 'my notes.md'],
      ['a trailing slash', 'notes/'],
      ['an empty nested segment', 'journal//2026.md'],
      ['a control character', 'notes\u0007.md'],
    ])('%s', (_label, id) => {
      expect(() => resolveDocumentPath(ROOT, id)).toThrow(InvalidDocumentIdError)
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
