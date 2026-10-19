'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createTreeContents } from '../../../src/client/browser/tree-contents.ts'
import type { TrashNode, TreeNode } from '../../../src/client/browser/tree/tree-model.ts'
import { showTrash, treePage } from './fixtures.ts'
import { TREE_SELECTOR } from '../../../src/client/browser/tree/tree-view.ts'
import { TRASH_LIST_SELECTOR } from '../../../src/client/browser/trash/trash-view.ts'

const NOTHING_SELECTED = null
const WHENEVER = '2026-01-01T00:00:00.000Z'

const SAMPLE: readonly TreeNode[] = [
  {
    name: 'journal',
    path: 'journal',
    kind: 'folder',
    children: [{ name: 'a.md', path: 'journal/a.md', kind: 'document' }],
  },
  { name: 'notes.md', path: 'notes.md', kind: 'document' },
]

const TRASHED: readonly TrashNode[] = [{ id: 'gone', originalPath: 'old.md', deletedAt: WHENEVER, kind: 'document' }]

let root: HTMLElement = document.createElement('div')

function contentsIn(selected: string | null = NOTHING_SELECTED): ReturnType<typeof createTreeContents> {
  const tree = root.querySelector<HTMLElement>(TREE_SELECTOR)
  if (tree === null) throw new Error('the fixture has no tree')

  return createTreeContents({
    root,
    tree,
    trashList: root.querySelector<HTMLElement>(TRASH_LIST_SELECTOR),
    selected: () => selected,
  })
}

beforeEach(() => {
  root = treePage()
})

describe('what the browser is holding', () => {
  it('holds nothing before the store has answered', () => {
    expect(contentsIn().folderPaths()).toStrictEqual([])
  })

  it('names the folders it was given, so the open set can be pruned against them', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)

    expect(contents.folderPaths()).toStrictEqual(['journal'])
  })

  it('counts what is in the trash, so a panel can say whether it is empty', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)

    expect(contents.trashHeld()).toBe(1)
  })
})

describe('which folders are expanded', () => {
  it('has none expanded to begin with', () => {
    expect(contentsIn().isOpen('journal')).toBe(false)
  })

  it('reports one it was opened to', () => {
    const contents = contentsIn()
    contents.openTo(new Set(['journal']))

    expect(contents.isOpen('journal')).toBe(true)
  })

  it('hands back the whole set, so a redraw can repeat it', () => {
    const contents = contentsIn()
    contents.openTo(new Set(['journal']))

    expect([...contents.openFolders()]).toStrictEqual(['journal'])
  })
})

describe('the rows a repaint leaves behind', () => {
  it('shows nothing until it is painted, however much it holds', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)

    expect(contents.shown()).toStrictEqual([])
  })

  it('shows a row for each entry at the top level once painted', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)

    contents.repaint()

    expect(contents.shown().map((row) => row.path)).toStrictEqual(['journal', 'notes.md'])
  })

  it('shows what an expanded folder holds, so the open set reaches the rows', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)
    contents.openTo(new Set(['journal']))

    contents.repaint()

    expect(contents.shown().map((row) => row.path)).toContain('journal/a.md')
  })

  it('finds a row by the path it names, so a drop can open what it landed on', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)
    contents.repaint()

    expect(contents.rowFor('notes.md')?.path).toBe('notes.md')
  })

  it('finds no row for a path that is not there, so an empty selection opens nothing', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)
    contents.repaint()

    expect(contents.rowFor(NOTHING_SELECTED)).toBeUndefined()
  })

  it('finds a row by position, which is what a keyboard and a drag both count in', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)
    contents.repaint()

    expect(contents.rowAt(1)?.path).toBe('notes.md')
  })

  it('gives back an element for each row, so a caller can focus one', () => {
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)
    contents.repaint()

    expect(contents.rowElements()).toHaveLength(2)
  })
})

describe('the panel in front', () => {
  it('is the file tree to begin with', () => {
    expect(contentsIn().showingTheTrash()).toBe(false)
  })

  it('is the trash once that panel is shown', () => {
    showTrash(root)

    expect(contentsIn().showingTheTrash()).toBe(true)
  })

  it('paints the trash rather than the tree while the trash is in front', () => {
    showTrash(root)
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)

    contents.repaint()

    expect(contents.shown().map((row) => row.path)).toStrictEqual(['.trash/gone'])
  })

  it('counts rows against the panel in front, so a click resolves in the right list', () => {
    showTrash(root)
    const contents = contentsIn()
    contents.replaceWith(SAMPLE, TRASHED)
    contents.repaint()

    expect(contents.shownHost()).toBe(root.querySelector(TRASH_LIST_SELECTOR))
  })
})
