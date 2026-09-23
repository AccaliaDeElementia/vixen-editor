'use sanity'

import { describe, expect, it } from 'vitest'

import { movedPath, relinkDocument, type PathMove } from '../../../src/server/markdown/relink.ts'

const RENAME_FILE: PathMove[] = [{ from: 'journal/a.md', to: 'journal/renamed.md' }]
const MOVE_FOLDER: PathMove[] = [{ from: 'journal', to: 'archive' }]

function destinationIn(markdown: string): string {
  return /\]\((?<destination>[^)]*)\)/u.exec(markdown)?.groups?.destination ?? ''
}

describe('movedPath', () => {
  it('returns a path no move touches unchanged', () => {
    expect(movedPath(MOVE_FOLDER, 'notes.md')).toBe('notes.md')
  })

  it('maps a path named exactly', () => {
    expect(movedPath(RENAME_FILE, 'journal/a.md')).toBe('journal/renamed.md')
  })

  it('maps a descendant of a moved folder', () => {
    expect(movedPath(MOVE_FOLDER, 'journal/2026/a.md')).toBe('archive/2026/a.md')
  })

  it('maps the moved folder itself', () => {
    expect(movedPath(MOVE_FOLDER, 'journal')).toBe('archive')
  })

  it('leaves a sibling that merely shares a prefix alone', () => {
    expect(movedPath(MOVE_FOLDER, 'journal2/a.md')).toBe('journal2/a.md')
  })

  it('applies the first move that matches', () => {
    const moves: PathMove[] = [
      { from: 'journal/a.md', to: 'first.md' },
      { from: 'journal', to: 'second' },
    ]

    expect(movedPath(moves, 'journal/a.md')).toBe('first.md')
  })
})

describe('a link to something that moved', () => {
  it('follows a renamed file', () => {
    const rewritten = relinkDocument('see [it](journal/a.md)', 'notes.md', RENAME_FILE)

    expect(rewritten).toBe('see [it](journal/renamed.md)')
  })

  it('follows a file into a moved folder', () => {
    const rewritten = relinkDocument('see [it](journal/2026/a.md)', 'notes.md', MOVE_FOLDER)

    expect(rewritten).toBe('see [it](archive/2026/a.md)')
  })

  it('follows an image', () => {
    const rewritten = relinkDocument('![p](journal/p.png)', 'notes.md', MOVE_FOLDER)

    expect(rewritten).toBe('![p](archive/p.png)')
  })

  it('follows a reference definition', () => {
    const rewritten = relinkDocument('[a][id]\n\n[id]: journal/a.md "t"', 'notes.md', MOVE_FOLDER)

    expect(rewritten).toBe('[a][id]\n\n[id]: archive/a.md "t"')
  })

  it('expresses the new path relative to the document that holds the link', () => {
    const rewritten = relinkDocument('[a](../journal/a.md)', 'deep/holder.md', MOVE_FOLDER)

    expect(rewritten).toBe('[a](../archive/a.md)')
  })

  it('walks up out of a subdirectory when it has to', () => {
    const rewritten = relinkDocument('[a](a.md)', 'journal/holder.md', [{ from: 'journal/a.md', to: 'a.md' }])

    expect(rewritten).toBe('[a](../a.md)')
  })

  it('leaves a link to something that did not move alone', () => {
    const markdown = '[a](other/b.md)'

    expect(relinkDocument(markdown, 'notes.md', MOVE_FOLDER)).toBe(markdown)
  })

  it('leaves a path inside code alone', () => {
    const markdown = '[a](journal/a.md)\n\n```\n[b](journal/a.md)\n```\n'

    expect(relinkDocument(markdown, 'notes.md', MOVE_FOLDER)).toBe('[a](archive/a.md)\n\n```\n[b](journal/a.md)\n```\n')
  })

  it('encodes the new path when it needs it', () => {
    const rewritten = relinkDocument('[a](journal/a.md)', 'notes.md', [{ from: 'journal/a.md', to: 'my file.md' }])

    expect(rewritten).toBe('[a](my%20file.md)')
  })

  it('recognises a destination that was written percent-encoded', () => {
    const rewritten = relinkDocument('[a](my%20file.md)', 'notes.md', [{ from: 'my file.md', to: 'plain.md' }])

    expect(rewritten).toBe('[a](plain.md)')
  })
})

// The document that moved keeps its own outbound links, and those are relative
// to where it now sits. A move that changes depth breaks every one of them.
describe('a document that moved keeps its own links working', () => {
  it('re-bases a link when the holder moves deeper', () => {
    const rewritten = relinkDocument('![p](p.png)', 'a.md', [{ from: 'a.md', to: 'deep/sub/a.md' }])

    expect(rewritten).toBe('![p](../../p.png)')
  })

  it('re-bases a link when the holder moves shallower', () => {
    const rewritten = relinkDocument('![p](../p.png)', 'journal/a.md', [{ from: 'journal/a.md', to: 'a.md' }])

    expect(rewritten).toBe('![p](p.png)')
  })

  it('re-bases a link to a sibling directory', () => {
    const rewritten = relinkDocument('![p](../img/p.png)', 'journal/a.md', [{ from: 'journal', to: 'deep/journal' }])

    expect(rewritten).toBe('![p](../../img/p.png)')
  })
})

// A folder move takes the links inside it along unchanged, because the holder
// and the target move together. Rewriting them would be churn, not repair.
describe('a folder that moves wholesale leaves its internal links untouched', () => {
  it.each([
    ['a bare sibling', '[a](b.md)'],
    ['an explicit ./ sibling', '[a](./b.md)'],
    ['an image', '![p](./p.png)'],
    ['a descendant', '[a](2026/b.md)'],
    ['a reference definition', '[a][id]\n\n[id]: ./b.md'],
  ])('leaves %s byte-identical', (_name, markdown) => {
    expect(relinkDocument(markdown, 'journal/a.md', MOVE_FOLDER)).toBe(markdown)
  })

  it('still re-bases a link that pointed outside the moved folder', () => {
    const rewritten = relinkDocument('[a](../shared/x.md)', 'journal/a.md', MOVE_FOLDER)

    expect(rewritten).toBe('[a](../shared/x.md)')
  })
})

describe('destinations that are not store paths are left alone', () => {
  it.each([
    ['an absolute URL', '[a](https://example.com/journal/a.md)'],
    ['a mailto', '[a](mailto:someone@example.com)'],
    ['a protocol-relative URL', '[a](//example.com/journal/a.md)'],
    ['a root-absolute path', '[a](/journal/a.md)'],
    ['a bare fragment', '[a](#section)'],
    ['a path escaping the store root', '[a](../../journal/a.md)'],
  ])('leaves %s alone', (_name, markdown) => {
    expect(relinkDocument(markdown, 'notes.md', MOVE_FOLDER)).toBe(markdown)
  })

  it('leaves a destination alone when the holder moved but the link is not a store path', () => {
    const markdown = '[a](https://example.com/x.md)'

    expect(relinkDocument(markdown, 'a.md', [{ from: 'a.md', to: 'deep/a.md' }])).toBe(markdown)
  })

  it('leaves a destination alone when the holder moved but the link escapes the store root', () => {
    const markdown = '[a](../../outside.md)'

    expect(relinkDocument(markdown, 'a.md', [{ from: 'a.md', to: 'deep/a.md' }])).toBe(markdown)
  })

  it('drops an explicit ./ when the re-based link has to walk upwards', () => {
    const rewritten = relinkDocument('![p](./p.png)', 'a.md', [{ from: 'a.md', to: 'deep/a.md' }])

    expect(rewritten).toBe('![p](../p.png)')
  })
})

describe('a fragment or query on the end of a destination', () => {
  it('keeps a fragment across a move', () => {
    const rewritten = relinkDocument('[a](journal/a.md#section)', 'notes.md', MOVE_FOLDER)

    expect(rewritten).toBe('[a](archive/a.md#section)')
  })

  it('keeps a query across a move', () => {
    const rewritten = relinkDocument('[a](journal/a.md?v=2)', 'notes.md', MOVE_FOLDER)

    expect(rewritten).toBe('[a](archive/a.md?v=2)')
  })

  it('keeps a fragment when only the holder moved', () => {
    const rewritten = relinkDocument('[a](x.md#s)', 'a.md', [{ from: 'a.md', to: 'deep/a.md' }])

    expect(rewritten).toBe('[a](../x.md#s)')
  })

  // `?` and `#` are legal in a filename here, so a destination can be read two
  // ways. The filename reading wins only when it names something that actually
  // moved, which is the one case where the ambiguity has a definite answer.
  it('prefers the filename reading when that is what moved', () => {
    const rewritten = relinkDocument('[a](a?b.md)', 'notes.md', [{ from: 'a?b.md', to: 'moved.md' }])

    expect(rewritten).toBe('[a](moved.md)')
  })

  it('falls back to the URL reading when the whole name matched nothing', () => {
    const rewritten = relinkDocument('[a](a?b.md)', 'notes.md', [{ from: 'a', to: 'moved' }])

    expect(destinationIn(rewritten)).toBe('moved?b.md')
  })
})

const CORPUS: Readonly<Record<string, string>> = {
  empty: '',
  prose: '# Heading\n\nNo links here.\n',
  inline: 'see [the journal](journal/a.md) today\n',
  encoded: '[a](my%2Dfile.md)\n',
  bracketed: '[a](<my file.md>)\n',
  backslashEscaped: '[a](a\\(b.md)\n',
  definition: '[a][id]\n\n[id]: journal/b.md "t"\n',
  fenced: '```js\nconst a = [1](2)\n```\n\n[a](after.md)\n',
  crlf: '[a](crlf.md)\r\n\r\n[id]: crlf2.md\r\n',

  // Paths written in a form this module would not have chosen. Re-expressing
  // them would tidy a document nobody asked it to touch, which is the silent
  // content rewriting the store is not allowed to do.
  dotSegment: '[a](./b.md)\n',
  redundantSegments: '[a](sub/../b.md)\n',
  doubleSlash: '[a](sub//b.md)\n',
  trailingDot: '[a](sub/./b.md)\n',
}

describe('a move that changes nothing for a document leaves it byte-identical', () => {
  it.each(Object.entries(CORPUS))('leaves the %s document untouched when nothing moved', (_name, markdown) => {
    expect(relinkDocument(markdown, 'notes.md', [])).toBe(markdown)
  })

  it.each(Object.entries(CORPUS))('leaves the %s document untouched by an unrelated move', (_name, markdown) => {
    expect(relinkDocument(markdown, 'notes.md', [{ from: 'elsewhere', to: 'somewhere' }])).toBe(markdown)
  })
})

describe('a link to a directory', () => {
  it('becomes the current directory when the holder lands beside it', () => {
    const rewritten = relinkDocument('[a](../journal)', 'journal/a.md', MOVE_FOLDER)

    expect(rewritten).toBe('[a](.)')
  })
})
