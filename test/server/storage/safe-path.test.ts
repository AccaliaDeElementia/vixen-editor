'use sanity'

import path from 'node:path'

import { DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS } from '../../../src/shared/documents.ts'

import { describe, expect, it } from 'vitest'

import { toError } from '../../../src/server/errors.ts'

import {
  assertNormalisedName,
  InvalidPathError,
  isAllowedName,
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
  ['whitespace only', '   '],
  ['a null byte', 'notes\u0000'],
  ['a null byte before a separator', 'notes\u0000/evil'],
  ['a newline', 'notes\n'],
  ['a trailing slash', 'notes/'],
  ['a control character', 'notes\u0007'],
]

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
      ['a space in the name', 'Finding Toy.md'],
      ['an apostrophe', "Rachel's notes.md"],
      ['an ampersand', 'Q&A.md'],
      ['brackets and parentheses', 'notes (draft) [1].md'],
      ['an accented letter', 'caf\u00e9.md'],
      ['CJK characters', '\u65e5\u672c\u8a9e.md'],
      ['an emoji', 'party \u{1F389}.md'],
      ['a joined emoji sequence', 'family \u{1F468}\u200D\u{1F469}\u200D\u{1F467}.md'],
      ['an emoji with a skin tone and a joiner', '\u{1F469}\u{1F3FD}\u200D\u{1F4BB}.md'],
      ['an emoji with a variation selector and a joiner', '\u2764\uFE0F\u200D\u{1F525}.md'],
      ['a folder named like a home directory', '~/notes.md'],
      ['a name that merely looks encoded', '%2e%2e/notes.md'],
      ['other punctuation', 'a+b,c#d!e.md'],
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
      ['an empty id', ''],
      ['whitespace only', '   '],
      ['a null byte', 'notes\u0000.md'],
      ['a null byte before the extension', 'notes\u0000/evil.md'],
      ['a newline', 'notes\n.md'],
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
    expect(() => resolveDocumentPath(ROOT, '../secrets.md')).toThrow(/\.\.\/secrets\.md/v)
  })

  it('does not disclose the document root in the error message reachable by a caller', () => {
    try {
      resolveDocumentPath(ROOT, '../secrets.md')
      expect.unreachable('expected resolveDocumentPath to throw')
    } catch (error) {
      expect(toError(error).message).not.toContain(ROOT)
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
    expect(() => resolveEntryPath(ROOT, 'notes.zip', DOCUMENT_EXTENSIONS)).toThrow(/\.md/v)
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

describe('names the validator refuses', () => {
  it.each([
    ['a backslash, which is a separator elsewhere', 'a\\b.md'],
    ['a tab', 'a\tb.md'],
    ['a newline', 'a\nb.md'],
    ['a null byte', 'a\u0000b.md'],
    ['a delete character', 'a\u007Fb.md'],
    ['a right-to-left override, which reverses how the name reads', 'photo\u202Egnp.md'],
    ['a left-to-right mark', 'a\u200Eb.md'],
    ['a zero-width space, which hides a difference between two names', 'no​tes.md'],
    ['a byte order mark', 'a﻿b.md'],
    ['a word joiner', 'a⁠b.md'],
    ['only whitespace', '   .md'],
    ['a leading space', ' notes.md'],
    ['a folder segment ending in a space', 'journal /notes.md'],
    ['a non-breaking space at the edge', ' notes.md'],
  ])('rejects %s', (_label, id) => {
    expect(() => resolveDocumentPath(ROOT, id)).toThrow(InvalidPathError)
  })

  describe('zero-width joiners outside an emoji sequence', () => {
    it.each([
      ['hidden inside ordinary text', 'no‍tes.md'],
      ['between a letter and an emoji', 'a‍\u{1F389}.md'],
      ['trailing after an emoji', '\u{1F389}‍.md'],
      ['leading before an emoji', '‍\u{1F389}.md'],
      ['hidden in text that also carries an emoji', 'no‍tes \u{1F389}.md'],
    ])('rejects one %s', (_label, id) => {
      expect(() => resolveDocumentPath(ROOT, id)).toThrow(InvalidPathError)
    })
  })

  describe('length, which the filesystem counts in bytes', () => {
    it('accepts a name of exactly the byte limit', () => {
      expect(() => resolveDocumentPath(ROOT, `${'a'.repeat(252)}.md`)).not.toThrow()
    })

    it('rejects a name one byte over', () => {
      expect(() => resolveDocumentPath(ROOT, `${'a'.repeat(253)}.md`)).toThrow(InvalidPathError)
    })

    it('accepts sixty-three emoji, which is exactly the limit at four bytes each', () => {
      expect(() => resolveDocumentPath(ROOT, `${'\u{1F389}'.repeat(63)}.md`)).not.toThrow()
    })

    it('counts an emoji as its four bytes, not as one character', () => {
      expect(() => resolveDocumentPath(ROOT, `${'\u{1F389}'.repeat(64)}.md`)).toThrow(InvalidPathError)
    })

    it('counts a CJK character as its three bytes', () => {
      expect(() => resolveDocumentPath(ROOT, `${'日'.repeat(85)}.md`)).toThrow(InvalidPathError)
    })

    it('measures each segment separately, not the whole path', () => {
      const segment = 'a'.repeat(200)

      expect(() => resolveDocumentPath(ROOT, `${segment}/${segment}/notes.md`)).not.toThrow()
    })
  })
})

describe('isAllowedName', () => {
  it.each([
    ['a plain name', 'notes.md'],
    ['a space', 'Finding Toy.md'],
    ['an emoji sequence', 'family \u{1F468}‍\u{1F469}.md'],
    ['a folder name', 'journal'],
  ])('accepts %s', (_label, name) => {
    expect(isAllowedName(name)).toBe(true)
  })

  it.each([
    ['a hidden name', '.hidden.md'],
    ['the trash', '.trash'],
    ['a stray joiner', 'no‍tes.md'],
    ['a bidi override', 'photo\u202Egnp.md'],
    ['whitespace padding', ' notes.md'],
  ])('refuses %s', (_label, name) => {
    expect(isAllowedName(name)).toBe(false)
  })

  it('agrees with the path validator on every name, so nothing is listed that cannot be opened', () => {
    const names = [
      'notes.md',
      'Finding Toy.md',
      "Rachel's notes.md",
      'Q&A.md',
      'café.md',
      '日本語.md',
      'party \u{1F389}.md',
      'family \u{1F468}‍\u{1F469}.md',
      '.hidden.md',
      'no‍tes.md',
      'photo\u202Egnp.md',
      '   .md',
      ' padded.md',
      'a\\b.md',
      `${'a'.repeat(300)}.md`,
    ]

    const disagreements = names.filter((name) => {
      const listed = isAllowedName(name)
      const openable = ((): boolean => {
        try {
          resolveDocumentPath(ROOT, name)
          return true
        } catch {
          return false
        }
      })()

      return listed !== openable
    })

    expect(disagreements).toStrictEqual([])
  })
})

describe('assertNormalisedName', () => {
  it('accepts a composed name', () => {
    expect(() => {
      assertNormalisedName('café.md')
    }).not.toThrow()
  })

  it('refuses a decomposed name, so new files are unambiguous', () => {
    expect(() => {
      assertNormalisedName('café.md')
    }).toThrow(InvalidPathError)
  })

  it('accepts a plain ascii name', () => {
    expect(() => {
      assertNormalisedName('notes.md')
    }).not.toThrow()
  })
})
