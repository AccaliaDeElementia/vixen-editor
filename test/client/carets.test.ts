'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { caretsFollowMove, recallCaret, rememberCaret, TestOnly } from '../../src/client/editor/carets.ts'
import { stringsIn } from '../../src/client/json.ts'
import { readJson } from '../../src/client/local-storage.ts'
import { isRecord } from '../../src/shared/guards.ts'

const { CARETS_KEY, REMEMBERED_DOCUMENTS } = TestOnly

const LONG_ENOUGH = 10_000
const SOMEWHERE_INSIDE = 5

function rememberedPaths(): string[] {
  const stored = readJson(CARETS_KEY)
  if (!Array.isArray(stored)) return []

  return stringsIn(stored.filter(isRecord).map((entry) => entry.path))
}

function fill(count: number): void {
  for (let n = 0; n < count; n += 1) rememberCaret(`doc-${String(n)}.md`, n)
}

beforeEach(() => {
  localStorage.clear()
})

describe('remembering a caret', () => {
  it('reads back the position it was given', () => {
    rememberCaret('notes.md', 42)

    expect(recallCaret('notes.md', LONG_ENOUGH)).toBe(42)
  })

  it('starts at the top for a document it has never seen', () => {
    expect(recallCaret('unseen.md', LONG_ENOUGH)).toBe(0)
  })

  it('replaces the position rather than accumulating entries for one document', () => {
    rememberCaret('notes.md', 42)
    rememberCaret('notes.md', 99)

    expect({ position: recallCaret('notes.md', LONG_ENOUGH), paths: rememberedPaths() }).toStrictEqual({
      position: 99,
      paths: ['notes.md'],
    })
  })
})

describe('a position past the end of the document', () => {
  it('is clamped, because the document may have been edited elsewhere', () => {
    rememberCaret('notes.md', 5000)

    expect(recallCaret('notes.md', 12)).toBe(12)
  })

  it('leaves a position inside the document alone', () => {
    rememberCaret('notes.md', 5)

    expect(recallCaret('notes.md', 12)).toBe(5)
  })
})

describe('the recency window', () => {
  it(`keeps only the ${String(REMEMBERED_DOCUMENTS)} most recent documents`, () => {
    fill(REMEMBERED_DOCUMENTS + 1)

    expect(rememberedPaths()).toHaveLength(REMEMBERED_DOCUMENTS)
  })

  it('evicts the least recently used, not the oldest position value', () => {
    fill(REMEMBERED_DOCUMENTS)

    rememberCaret('newcomer.md', 1)

    expect(rememberedPaths()).not.toContain('doc-0.md')
  })

  it('moves an entry to the head when its caret is read, so reading counts as use', () => {
    fill(REMEMBERED_DOCUMENTS)

    recallCaret('doc-0.md', LONG_ENOUGH)
    rememberCaret('newcomer.md', 1)

    expect(rememberedPaths()).toContain('doc-0.md')
  })

  it('evicts the next-oldest instead, once reading has rescued the oldest', () => {
    fill(REMEMBERED_DOCUMENTS)

    recallCaret('doc-0.md', LONG_ENOUGH)
    rememberCaret('newcomer.md', 1)

    expect(rememberedPaths()).not.toContain('doc-1.md')
  })

  it('does not record a document that was never remembered, just because it was asked for', () => {
    recallCaret('unseen.md', LONG_ENOUGH)

    expect(rememberedPaths()).toStrictEqual([])
  })
})

describe('following a move', () => {
  it('carries the caret to the new path', () => {
    rememberCaret('notes.md', 42)

    caretsFollowMove({ from: 'notes.md', to: 'archive/notes.md' })

    expect(recallCaret('archive/notes.md', LONG_ENOUGH)).toBe(42)
  })

  it('leaves nothing behind at the old path', () => {
    rememberCaret('notes.md', 42)

    caretsFollowMove({ from: 'notes.md', to: 'archive/notes.md' })

    expect(rememberedPaths()).toStrictEqual(['archive/notes.md'])
  })

  it('carries a document the folder move never named', () => {
    rememberCaret('journal/entry.md', 7)

    caretsFollowMove({ from: 'journal', to: 'archive/journal' })

    expect(recallCaret('archive/journal/entry.md', LONG_ENOUGH)).toBe(7)
  })

  it('leaves an unrelated document where it is', () => {
    rememberCaret('notes.md', 42)

    caretsFollowMove({ from: 'journal', to: 'archive/journal' })

    expect(recallCaret('notes.md', LONG_ENOUGH)).toBe(42)
  })
})

describe('storage that cannot be used', () => {
  it('reports the top of the document rather than failing the editor', () => {
    expect(recallCaret('notes.md', LONG_ENOUGH, null)).toBe(0)
  })

  it('accepts a position it cannot keep', () => {
    expect(() => {
      rememberCaret('notes.md', 42, null)
    }).not.toThrow()
  })

  it('accepts a move it cannot record', () => {
    expect(() => {
      caretsFollowMove({ from: 'notes.md', to: 'archive/notes.md' }, null)
    }).not.toThrow()
  })
})

describe('a corrupted store', () => {
  it('ignores a value that is not a list of entries', () => {
    localStorage.setItem(CARETS_KEY, JSON.stringify({ notAList: true }))

    expect(recallCaret('notes.md', LONG_ENOUGH)).toBe(0)
  })

  it('drops entries of the wrong shape and keeps the rest', () => {
    localStorage.setItem(
      CARETS_KEY,
      JSON.stringify([{ path: 'notes.md', position: 'over there' }, { path: 'kept.md', position: 3 }, 'rubbish']),
    )

    expect({ broken: recallCaret('notes.md', LONG_ENOUGH), kept: recallCaret('kept.md', LONG_ENOUGH) }).toStrictEqual({
      broken: 0,
      kept: 3,
    })
  })

  it('discards a stored value that is not an entry at all', () => {
    localStorage.setItem(CARETS_KEY, JSON.stringify(['rubbish']))

    rememberCaret('notes.md', SOMEWHERE_INSIDE)

    expect(readJson(CARETS_KEY)).toStrictEqual([{ path: 'notes.md', position: SOMEWHERE_INSIDE }])
  })

  it('refuses a negative position, which no document has', () => {
    localStorage.setItem(CARETS_KEY, JSON.stringify([{ path: 'notes.md', position: -1 }]))

    expect(recallCaret('notes.md', LONG_ENOUGH)).toBe(0)
  })
})
