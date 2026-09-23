'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { parseTree, type TrashNode, type TreeNode } from '../../src/client/files/tree-model.ts'
import {
  renderTree,
  rowIndexOf,
  ROW_SELECTOR,
  TRASH_PATH,
  type TreeViewModel,
} from '../../src/client/files/tree-view.ts'

const SAMPLE = parseTree({
  tree: [
    {
      name: 'journal',
      path: 'journal',
      kind: 'folder',
      children: [
        { name: '2026', path: 'journal/2026', kind: 'folder', children: [] },
        { name: 'entry.md', path: 'journal/entry.md', kind: 'document' },
      ],
    },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
    { name: 'photo.png', path: 'photo.png', kind: 'image' },
  ],
})

let tree: HTMLElement

function render(overrides: Partial<TreeViewModel> = {}): void {
  const model: TreeViewModel = { nodes: SAMPLE, trash: [], open: new Set(), selected: null, ...overrides }
  renderTree(tree, model)
}

function rows(): HTMLElement[] {
  return [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
}

function pathsShown(): Array<string | undefined> {
  return rows().map((element) => element.dataset.path)
}

function rowFor(entryPath: string): HTMLElement {
  const found = rows().find((element) => element.dataset.path === entryPath)
  if (found === undefined) throw new Error(`no row for ${entryPath}`)
  return found
}

function iconOf(entryPath: string): string {
  return rowFor(entryPath).querySelector('.tree__icon')?.textContent ?? ''
}

function twistyOf(entryPath: string): string {
  return rowFor(entryPath).querySelector('.tree__twisty')?.textContent ?? ''
}

beforeEach(() => {
  document.body.innerHTML = '<ul id="file-tree" role="tree"></ul>'
  const element = document.body.querySelector<HTMLElement>('#file-tree')
  if (element === null) throw new Error('missing tree')
  tree = element
})

describe('rendering', () => {
  it('shows every top-level entry', () => {
    render()

    expect(pathsShown()).toStrictEqual(['journal', 'notes.md', 'photo.png', TRASH_PATH])
  })

  it('hides the contents of a collapsed folder', () => {
    render()

    expect(pathsShown()).not.toContain('journal/entry.md')
  })

  it('shows the contents of an open folder', () => {
    render({ open: new Set(['journal']) })

    expect(pathsShown()).toContain('journal/entry.md')
  })

  it('nests children in a group, as a tree widget must', () => {
    render({ open: new Set(['journal']) })

    expect(rowFor('journal/entry.md').closest('[role="group"]')).not.toBeNull()
  })

  it('collapses a nested folder independently of its parent', () => {
    render({ open: new Set(['journal']) })

    expect(rowFor('journal/2026').getAttribute('aria-expanded')).toBe('false')
  })

  it('replaces the previous render rather than appending to it', () => {
    render()
    render()

    expect(pathsShown()).toStrictEqual(['journal', 'notes.md', 'photo.png', TRASH_PATH])
  })

  it('records depth, so indentation follows the structure', () => {
    render({ open: new Set(['journal']) })

    expect(rowFor('journal').style.getPropertyValue('--depth')).toBe('0')
    expect(rowFor('journal/entry.md').style.getPropertyValue('--depth')).toBe('1')
  })
})

describe('icons', () => {
  it.each([
    ['a document', 'notes.md', 'description'],
    ['an image', 'photo.png', 'image'],
    ['a folder', 'journal', 'folder'],
  ])('marks %s', (_label, entryPath, expected) => {
    render()

    expect(iconOf(entryPath)).toBe(expected)
  })

  it('carries a kind on the row, so the stylesheet can colour it', () => {
    render()

    expect(rowFor('notes.md').dataset.kind).toBe('document')
    expect(rowFor('photo.png').dataset.kind).toBe('image')
    expect(rowFor('journal').dataset.kind).toBe('folder')
  })

  it('turns the twisty down when a folder is open', () => {
    render({ open: new Set(['journal']) })

    expect(twistyOf('journal')).toBe('expand_more')
  })

  it('points the twisty right when a folder is closed', () => {
    render()

    expect(twistyOf('journal')).toBe('chevron_right')
  })

  it('gives a file no twisty, because it has nothing to expand', () => {
    render()

    expect(twistyOf('notes.md')).toBe('')
  })
})

describe('links', () => {
  it('makes a document a real link, so it opens in a new tab like any other', () => {
    render()

    expect(rowFor('notes.md').getAttribute('href')).toBe('/doc/notes.md')
  })

  it('links an image too', () => {
    render()

    expect(rowFor('photo.png').getAttribute('href')).toBe('/doc/photo.png')
  })

  it('gives a folder no link, because it is expanded rather than opened', () => {
    render()

    expect(rowFor('journal').hasAttribute('href')).toBe(false)
  })
})

describe('accessibility', () => {
  it('marks a folder as expandable and a file as not', () => {
    render()

    expect(rowFor('journal').hasAttribute('aria-expanded')).toBe(true)
    expect(rowFor('notes.md').hasAttribute('aria-expanded')).toBe(false)
  })

  it('marks the selected entry', () => {
    render({ selected: 'notes.md' })

    expect(rowFor('notes.md').getAttribute('aria-selected')).toBe('true')
    expect(rowFor('photo.png').getAttribute('aria-selected')).toBe('false')
  })

  it('leaves exactly one row reachable by tab', () => {
    render({ open: new Set(['journal']) })

    expect(rows().filter((element) => element.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  it('puts the tab stop on the selected row', () => {
    render({ selected: 'photo.png' })

    expect(rowFor('photo.png').getAttribute('tabindex')).toBe('0')
  })

  it('puts the tab stop on the first row when nothing is selected', () => {
    render()

    expect(rowFor('journal').getAttribute('tabindex')).toBe('0')
  })

  it('still leaves a tab stop when the tree holds nothing but the trash', () => {
    renderTree(tree, { nodes: [], trash: [], open: new Set(), selected: null })

    expect(rowFor(TRASH_PATH).getAttribute('tabindex')).toBe('0')
  })
})

describe('the trash pseudo-folder', () => {
  const entry: TrashNode = {
    id: 'aaaa',
    originalPath: 'journal/gone.md',
    kind: 'document',
    deletedAt: '2026-01-01T00:00:00.000Z',
  }

  it('sits at the bottom, where a user looks for it', () => {
    render()

    expect(pathsShown().at(-1)).toBe(TRASH_PATH)
  })

  it('counts what it holds without being opened', () => {
    render({ trash: [entry] })

    expect(rowFor(TRASH_PATH).textContent).toContain('Trash (1)')
  })

  it('hides its entries until opened', () => {
    render({ trash: [entry] })

    expect(tree.querySelectorAll('[data-trash-id]')).toHaveLength(0)
  })

  it('lists deleted entries by where they came from', () => {
    render({ trash: [entry], open: new Set([TRASH_PATH]) })

    expect(tree.querySelector('[data-trash-id]')?.textContent).toContain('journal/gone.md')
  })

  it('carries the entry id, which restore and purge address it by', () => {
    render({ trash: [entry], open: new Set([TRASH_PATH]) })

    expect(tree.querySelector<HTMLElement>('[data-trash-id]')?.dataset.trashId).toBe('aaaa')
  })

  it('tells a deleted entry from a live one, which is the point of showing it here', () => {
    render({ trash: [entry], open: new Set([TRASH_PATH]) })
    const deleted = tree.querySelector<HTMLElement>('[data-trash-id]')

    expect(deleted?.hasAttribute('href')).toBe(false)
    expect(deleted?.title).toContain('2026-01-01')
  })

  it('shows the kind of the deleted entry', () => {
    render({ trash: [{ ...entry, kind: 'folder' }], open: new Set([TRASH_PATH]) })

    expect(tree.querySelector('[data-trash-id] .tree__icon')?.textContent).toBe('folder')
  })
})

describe('an empty store', () => {
  it('renders nothing but the trash', () => {
    const empty: readonly TreeNode[] = []
    renderTree(tree, { nodes: empty, trash: [], open: new Set(), selected: null })

    expect(pathsShown()).toStrictEqual([TRASH_PATH])
  })
})

describe('rowIndexOf', () => {
  it('finds the row an event came from', () => {
    render()

    expect(rowIndexOf(tree, rowFor('notes.md'))).toBe(1)
  })

  it('finds the row when the event came from something inside it', () => {
    render()
    const inner = rowFor('notes.md').querySelector('.tree__name')

    expect(rowIndexOf(tree, inner)).toBe(1)
  })

  it('reports no row for the container itself', () => {
    render()

    expect(rowIndexOf(tree, tree)).toBe(-1)
  })

  it('reports no row for a target that is not an element at all', () => {
    render()

    expect(rowIndexOf(tree, new EventTarget())).toBe(-1)
  })

  it('reports no row for no target', () => {
    render()

    expect(rowIndexOf(tree, null)).toBe(-1)
  })
})
