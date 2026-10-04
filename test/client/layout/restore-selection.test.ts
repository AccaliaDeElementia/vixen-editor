'use sanity'

import { describe, expect, it } from 'vitest'

import { createRestoreSelection } from '../../../src/client/layout/restore-selection.ts'
import type { TrashEntryNode } from '../../../src/client/files/trash-entry.ts'

interface Shape {
  name: string
  path: string
  kind?: TrashEntryNode['kind']
  restorable?: boolean
  blockedBy?: string | null
  children?: Shape[]
}

function node(shape: Shape): TrashEntryNode {
  return {
    name: shape.name,
    path: shape.path,
    kind: shape.kind ?? 'document',
    restorable: shape.restorable ?? true,
    blockedBy: shape.blockedBy ?? null,
    children: (shape.children ?? []).map(node),
  }
}

function journal(): TrashEntryNode {
  return node({
    name: 'journal',
    path: '',
    kind: 'folder',
    children: [
      {
        name: '2026',
        path: '2026',
        kind: 'folder',
        children: [
          { name: 'a.md', path: '2026/a.md' },
          { name: 'b.md', path: '2026/b.md' },
        ],
      },
      { name: 'notes.md', path: 'notes.md' },
    ],
  })
}

describe('a selection over a trashed entry', () => {
  it('starts with nothing chosen', () => {
    const selection = createRestoreSelection(journal())

    expect(selection.roots()).toStrictEqual([])
  })

  it('reads as untouched before anything is ticked', () => {
    const selection = createRestoreSelection(journal())

    expect(selection.stateOf('2026/a.md')).toBe('off')
  })

  it('takes a ticked folder as a single root, so one move restores the subtree', () => {
    const selection = createRestoreSelection(journal())

    selection.toggle('2026')

    expect(selection.roots()).toStrictEqual(['2026'])
  })

  it('shows everything under a ticked folder as ticked too', () => {
    const selection = createRestoreSelection(journal())

    selection.toggle('2026')

    expect(selection.stateOf('2026/b.md')).toBe('on')
  })

  it('marks an ancestor of a ticked node as partly ticked', () => {
    const selection = createRestoreSelection(journal())

    selection.toggle('2026/a.md')

    expect(selection.stateOf('2026')).toBe('mixed')
  })

  it('leaves a folder partly ticked when one of its children is dropped', () => {
    const selection = createRestoreSelection(journal())
    selection.toggle('')

    selection.toggle('2026/a.md')

    expect(selection.stateOf('')).toBe('mixed')
  })

  it('keeps a whole sibling folder as one root when something elsewhere is dropped', () => {
    const selection = createRestoreSelection(journal())
    selection.toggle('')

    selection.toggle('notes.md')

    expect(selection.roots()).toStrictEqual(['2026'])
  })

  it('splits a broken-up folder into the parts that survived', () => {
    const selection = createRestoreSelection(journal())
    selection.toggle('')

    selection.toggle('2026/a.md')

    expect(selection.roots()).toStrictEqual(['2026/b.md', 'notes.md'])
  })

  it('leaves what was never ticked alone when an inner folder is broken up', () => {
    const selection = createRestoreSelection(journal())
    selection.toggle('2026')

    selection.toggle('2026/a.md')

    expect(selection.roots()).toStrictEqual(['2026/b.md'])
  })

  it('drops a ticked folder whole when it is unticked', () => {
    const selection = createRestoreSelection(journal())
    selection.toggle('2026')

    selection.toggle('2026')

    expect(selection.roots()).toStrictEqual([])
  })

  it('swallows a root that is already inside a folder being ticked', () => {
    const selection = createRestoreSelection(journal())
    selection.toggle('2026/a.md')

    selection.toggle('2026')

    expect(selection.roots()).toStrictEqual(['2026'])
  })

  it('ignores a path the entry does not hold', () => {
    const selection = createRestoreSelection(journal())

    selection.toggle('elsewhere.md')

    expect(selection.roots()).toStrictEqual([])
  })

  it('reads a path the entry does not hold as untouched', () => {
    const selection = createRestoreSelection(journal())

    expect(selection.stateOf('elsewhere.md')).toBe('off')
  })
})

describe('a node that could not be restored on its own', () => {
  function withOddities(): TrashEntryNode {
    return node({
      name: 'journal',
      path: '',
      kind: 'folder',
      children: [
        { name: 'taken.md', path: 'taken.md', blockedBy: 'journal/taken.md' },
        { name: '.odd.md', path: '.odd.md', restorable: false },
        { name: 'free.md', path: 'free.md' },
      ],
    })
  }

  it('refuses to be ticked when something is back in its place', () => {
    const selection = createRestoreSelection(withOddities())

    selection.toggle('taken.md')

    expect(selection.roots()).toStrictEqual([])
  })

  it('refuses to be ticked when its name is no longer allowed', () => {
    const selection = createRestoreSelection(withOddities())

    selection.toggle('.odd.md')

    expect(selection.roots()).toStrictEqual([])
  })

  it('rides along inside a ticked folder, where it needs no name of its own', () => {
    const selection = createRestoreSelection(withOddities())

    selection.toggle('')

    expect(selection.stateOf('.odd.md')).toBe('on')
  })

  it('is left behind rather than promoted when the folder around it is broken up', () => {
    const selection = createRestoreSelection(withOddities())
    selection.toggle('')

    selection.toggle('free.md')

    expect(selection.roots()).toStrictEqual([])
  })
})
