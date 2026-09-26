'use sanity'

import { describe, expect, it } from 'vitest'

import { restoreCandidatesFor } from '../../src/client/files/restore-candidates.ts'
import type { TrashNode } from '../../src/client/files/tree-model.ts'

function trashed(originalPath: string, kind: TrashNode['kind'], deletedAt: string, id = originalPath): TrashNode {
  return { id, originalPath, kind, deletedAt }
}

const EARLIER = '2026-09-01T10:00:00.000Z'
const LATER = '2026-09-02T10:00:00.000Z'

function paths(entries: ReadonlyArray<{ id: string }>): string[] {
  return entries.map((entry) => entry.id)
}

describe('a path that was deleted directly', () => {
  it('is offered', () => {
    const trash = [trashed('journal/a.md', 'document', EARLIER)]

    expect(paths(restoreCandidatesFor('journal/a.md', trash, new Set()))).toStrictEqual(['journal/a.md'])
  })

  it('is always restorable, because the view only exists while the path is free', () => {
    const trash = [trashed('journal/a.md', 'document', EARLIER)]

    expect(restoreCandidatesFor('journal/a.md', trash, new Set(['journal'])).at(0)?.blockedBy).toBeNull()
  })

  it('restores only itself, not a surrounding folder', () => {
    const trash = [trashed('journal/a.md', 'document', EARLIER)]

    expect(restoreCandidatesFor('journal/a.md', trash, new Set()).at(0)?.whole).toBe(false)
  })

  it('appears once per deletion, because deleting the same path twice yields two entries', () => {
    const trash = [
      trashed('journal/a.md', 'document', EARLIER, 'first'),
      trashed('journal/a.md', 'document', LATER, 'second'),
    ]

    expect(paths(restoreCandidatesFor('journal/a.md', trash, new Set()))).toStrictEqual(['second', 'first'])
  })

  it('ignores an unrelated deletion', () => {
    const trash = [trashed('journal/b.md', 'document', EARLIER)]

    expect(restoreCandidatesFor('journal/a.md', trash, new Set())).toStrictEqual([])
  })
})

describe('a deleted folder that might have contained it', () => {
  it('is offered as a candidate', () => {
    const trash = [trashed('journal', 'folder', EARLIER)]

    expect(paths(restoreCandidatesFor('journal/a.md', trash, new Set()))).toStrictEqual(['journal'])
  })

  it('says it restores the whole folder, because that blast radius is not discovered afterwards', () => {
    const trash = [trashed('journal', 'folder', EARLIER)]

    expect(restoreCandidatesFor('journal/a.md', trash, new Set()).at(0)?.whole).toBe(true)
  })

  it('tells a path inside the folder from a sibling whose name merely extends it', () => {
    const trash = [trashed('journal', 'folder', EARLIER)]
    const offeredFor = (missingPath: string): number => restoreCandidatesFor(missingPath, trash, new Set()).length

    expect({ inside: offeredFor('journal/a.md'), sibling: offeredFor('journal2/a.md') }).toStrictEqual({
      inside: 1,
      sibling: 0,
    })
  })

  it('matches a grandparent as well as a parent', () => {
    const trash = [trashed('journal', 'folder', EARLIER)]

    expect(paths(restoreCandidatesFor('journal/2026/a.md', trash, new Set()))).toStrictEqual(['journal'])
  })

  it('ignores a deleted document that happens to prefix the path', () => {
    const trash = [trashed('journal', 'document', EARLIER)]

    expect(restoreCandidatesFor('journal/a.md', trash, new Set())).toStrictEqual([])
  })

  it('is blocked when the folder is back, which is the common shape', () => {
    const trash = [trashed('journal', 'folder', EARLIER)]

    expect(restoreCandidatesFor('journal/a.md', trash, new Set(['journal'])).at(0)?.blockedBy).toBe('journal')
  })

  it('is free when the whole folder is still absent, which is when it is most useful', () => {
    const trash = [trashed('journal', 'folder', EARLIER)]

    expect(restoreCandidatesFor('journal/a.md', trash, new Set(['other'])).at(0)?.blockedBy).toBeNull()
  })
})

describe('the order candidates are offered in', () => {
  it('puts a direct match ahead of a folder that merely might contain it', () => {
    const trash = [trashed('journal', 'folder', LATER), trashed('journal/a.md', 'document', EARLIER)]

    expect(paths(restoreCandidatesFor('journal/a.md', trash, new Set()))).toStrictEqual(['journal/a.md', 'journal'])
  })

  it('does so whichever order the listing arrives in', () => {
    const trash = [trashed('journal/a.md', 'document', EARLIER), trashed('journal', 'folder', LATER)]

    expect(paths(restoreCandidatesFor('journal/a.md', trash, new Set()))).toStrictEqual(['journal/a.md', 'journal'])
  })

  it('puts the most recent deletion first within a group', () => {
    const trash = [trashed('journal', 'folder', EARLIER, 'older'), trashed('journal/2026', 'folder', LATER, 'newer')]

    expect(paths(restoreCandidatesFor('journal/2026/a.md', trash, new Set()))).toStrictEqual(['newer', 'older'])
  })
  it('orders several deletions newest first, whichever order they arrive in', () => {
    const MIDDLE = '2026-09-01T18:00:00.000Z'
    const trash = [
      trashed('journal/a.md', 'document', EARLIER, 'oldest'),
      trashed('journal/a.md', 'document', LATER, 'newest'),
      trashed('journal/a.md', 'document', MIDDLE, 'middle'),
    ]

    expect(paths(restoreCandidatesFor('journal/a.md', trash, new Set()))).toStrictEqual(['newest', 'middle', 'oldest'])
  })

  it('keeps two deletions recorded at the same instant rather than dropping one', () => {
    const trash = [
      trashed('journal/a.md', 'document', EARLIER, 'first'),
      trashed('journal/a.md', 'document', EARLIER, 'second'),
    ]

    expect(paths(restoreCandidatesFor('journal/a.md', trash, new Set()))).toHaveLength(2)
  })
})

describe('nothing to offer', () => {
  it('returns no candidates for an empty trash', () => {
    expect(restoreCandidatesFor('journal/a.md', [], new Set())).toStrictEqual([])
  })
})
