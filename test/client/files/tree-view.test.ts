'use sanity'

import { given } from '../../conditions.ts'
import { beforeEach, describe, expect, it } from 'vitest'

import { parseTree, type TrashNode, type TreeNode } from '../../../src/client/files/tree-model.ts'
import { joinPath } from '../../../src/shared/store-path.ts'
import {
  renderTrashPanel,
  renderTree,
  rowIndexOf,
  ROW_SELECTOR,
  TRASH_PATH,
  type TreeViewModel,
} from '../../../src/client/files/tree-view.ts'

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

const GLYPH_TRASH_ENTRY: TrashNode = {
  id: 'bbbb',
  originalPath: 'journal/glyphs.md',
  kind: 'document',
  deletedAt: '2026-01-01T00:00:00.000Z',
}

let tree: HTMLElement = document.createElement('ul')
let list: HTMLElement = document.createElement('ul')

function render(overrides: Partial<TreeViewModel> = {}): void {
  const model: TreeViewModel = { nodes: SAMPLE, open: new Set(), selected: null, ...overrides }
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
  document.body.innerHTML = '<ul id="file-tree" role="tree"></ul><ul id="trash-list" role="tree"></ul>'
  const element = document.body.querySelector<HTMLElement>('#file-tree')
  const deleted = document.body.querySelector<HTMLElement>('#trash-list')
  if (element === null || deleted === null) throw new Error('missing tree')
  tree = element
  list = deleted
})

describe('rendering', () => {
  it('shows every top-level entry', () => {
    render()

    expect(pathsShown()).toStrictEqual(['journal', 'notes.md', 'photo.png'])
  })

  it('hides the contents of a collapsed folder', () => {
    render()
    given(() => {
      expect(pathsShown()).toContain('journal')
    })

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

    expect(pathsShown()).toStrictEqual(['journal', 'notes.md', 'photo.png'])
  })

  it('records depth, so indentation follows the structure', () => {
    render({ open: new Set(['journal']) })

    expect({
      folder: rowFor('journal').style.getPropertyValue('--depth'),
      child: rowFor('journal/entry.md').style.getPropertyValue('--depth'),
    }).toStrictEqual({ folder: '0', child: '1' })
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

  it.each([
    ['a document', 'notes.md', 'document'],
    ['an image', 'photo.png', 'image'],
    ['a folder', 'journal', 'folder'],
  ])('carries the kind of %s on the row, so the stylesheet can colour it', (_label, entryPath, expected) => {
    render()

    expect(rowFor(entryPath).dataset.kind).toBe(expected)
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
  it.each([
    ['a folder as expandable', 'journal', true],
    ['a file as not', 'notes.md', false],
  ])('marks %s', (_label, entryPath, expected) => {
    render()

    expect(rowFor(entryPath).hasAttribute('aria-expanded')).toBe(expected)
  })

  it('hides every decorative glyph from assistive technology, since each repeats its row', () => {
    render({ open: new Set(['journal']) })
    const glyphs = [...tree.querySelectorAll<HTMLElement>('.icon')]
    given(() => {
      expect(glyphs.length).toBeGreaterThan(0)
    })

    expect(glyphs.filter((glyph) => glyph.getAttribute('aria-hidden') !== 'true')).toStrictEqual([])
  })

  it('marks every entry row draggable, which is what lets a drag begin at all', () => {
    render()
    const entries = rows()
    given(() => {
      expect(entries.length).toBeGreaterThan(0)
    })

    expect(entries.filter((element) => !element.draggable)).toStrictEqual([])
  })

  it('marks the selected entry', () => {
    render({ selected: 'notes.md' })

    expect(rowFor('notes.md').getAttribute('aria-selected')).toBe('true')
  })

  it('says false on the rows that are not selected, rather than omitting the attribute', () => {
    render({ selected: 'notes.md' })

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

  it('leaves the first deleted entry reachable when the trash panel is what is showing', () => {
    renderTrashPanel(list, { trash: [GLYPH_TRASH_ENTRY], selected: null })

    expect(list.querySelector('[role="treeitem"]')?.getAttribute('tabindex')).toBe('0')
  })
})

describe('the trash panel', () => {
  const entry: TrashNode = {
    id: 'aaaa',
    originalPath: 'journal/gone.md',
    kind: 'document',
    deletedAt: '2026-01-01T00:00:00.000Z',
  }

  function deleted(...held: readonly TrashNode[]): HTMLElement | null {
    renderTrashPanel(list, { trash: held, selected: null })

    return list.querySelector<HTMLElement>('[role="treeitem"][data-trash-id]')
  }

  it('lists deleted entries by where they came from', () => {
    expect(deleted(entry)?.textContent).toContain('journal/gone.md')
  })

  it('lists them flat, with no folder to open first', () => {
    renderTrashPanel(list, { trash: [entry, { ...entry, id: 'bbbb' }], selected: null })

    expect(list.querySelectorAll('[role="treeitem"]')).toHaveLength(2)
  })

  it('leaves a deleted entry unselected, because selection addresses the live tree', () => {
    expect(deleted(entry)?.getAttribute('aria-selected')).toBe('false')
  })

  it('carries the entry id, which restore and purge address it by', () => {
    expect(deleted(entry)?.dataset.trashId).toBe('aaaa')
  })

  it('tells a deleted entry from a live one, which is the point of showing it here', () => {
    expect(deleted(entry)?.title).toContain('2026-01-01')
  })

  it('opens the entry by its id, because its old path may name a live document again', () => {
    expect(deleted(entry)?.getAttribute('href')).toBe('/trash/aaaa')
  })

  it('shows the kind of the deleted entry', () => {
    renderTrashPanel(list, { trash: [{ ...entry, kind: 'folder' }], selected: null })

    expect(list.querySelector('[role="treeitem"] .tree__icon')?.textContent).toBe('folder')
  })

  it('shows nothing at all when nothing has been deleted', () => {
    renderTrashPanel(list, { trash: [], selected: null })

    expect(list.querySelectorAll('[role="treeitem"]')).toHaveLength(0)
  })
})

describe('an empty store', () => {
  it('renders no rows at all, since the trash is no longer in the tree', () => {
    const empty: readonly TreeNode[] = []
    renderTree(tree, { nodes: empty, open: new Set(), selected: null })

    expect(pathsShown()).toStrictEqual([])
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

    expect(rowIndexOf(tree, tree)).toBeNull()
  })

  it('reports no row for a target that is not an element at all', () => {
    render()

    expect(rowIndexOf(tree, new EventTarget())).toBeNull()
  })

  it('reports no row for one that belongs to a different tree', () => {
    render()
    const other = document.createElement('div')
    other.append(rowFor('notes.md').cloneNode(true))

    expect(rowIndexOf(tree, other.querySelector('.tree__row'))).toBeNull()
  })

  it('reports no row for no target', () => {
    render()

    expect(rowIndexOf(tree, null)).toBeNull()
  })
})

describe('a trash entry row', () => {
  const entry: TrashNode = {
    id: 'aaaa',
    originalPath: 'journal/gone.md',
    kind: 'document',
    deletedAt: '2026-01-01T00:00:00.000Z',
  }

  function deletedRow(): HTMLElement {
    renderTrashPanel(list, { trash: [entry], selected: null })
    const found = list.querySelector<HTMLElement>(`[data-path="${joinPath(TRASH_PATH, entry.id)}"]`)
    if (found === null) throw new Error('no row for the deleted entry')

    return found
  }

  it('keeps the deletion time on the row, where it belongs', () => {
    expect(deletedRow().title).toContain('2026-01-01')
  })

  it('carries no buttons of its own, since the entry page owns those', () => {
    expect(deletedRow().querySelector('button')).toBeNull()
  })
})

describe('a redraw while the reader is part way through something', () => {
  it('keeps the row element, so a gesture that began on it is not destroyed', () => {
    render()
    const before = rowFor('notes.md')

    render()

    expect(rowFor('notes.md')).toBe(before)
  })

  it('keeps focus where the reader put it', () => {
    document.body.append(tree)
    render()
    rowFor('notes.md').focus()
    given(() => {
      expect(document.activeElement).toBe(rowFor('notes.md'))
    })

    render()

    expect(document.activeElement).toBe(rowFor('notes.md'))
  })

  it('still redraws what changed, rather than keeping a stale row', () => {
    render()
    given(() => {
      expect(rowFor('notes.md').getAttribute('aria-selected')).toBe('false')
    })

    render({ selected: 'notes.md' })

    expect(rowFor('notes.md').getAttribute('aria-selected')).toBe('true')
  })

  it('lets go of a row the tree no longer holds', () => {
    render()

    render({ nodes: parseTree({ tree: [{ name: 'notes.md', path: 'notes.md', kind: 'document' }] }) })

    expect(pathsShown()).toStrictEqual(['notes.md'])
  })
})

describe('a row whose name is too long to show', () => {
  it('carries that name as a title, so the clipped part can still be read', () => {
    render({ open: new Set(['journal']) })

    expect(rowFor('journal/entry.md').title).toBe('entry.md')
  })

  it('carries the folder name too, since a folder clips the same way', () => {
    render()

    expect(rowFor('journal').title).toBe('journal')
  })
})
