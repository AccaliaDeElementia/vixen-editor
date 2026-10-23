'use sanity'

import { given } from '../../../conditions.ts'
import { beforeEach, describe, expect, it } from 'vitest'

import { parseTree } from '../../../../src/client/browser/tree/tree-model.ts'
import {
  applyRovingTabindex,
  isStoreRow,
  row,
  rowIndexOf,
  type VisibleRow,
} from '../../../../src/client/browser/tree/drawing.ts'

import { mountTree, pathsShown, render, rowFor, rows, treeElement } from './render-fixtures.ts'

beforeEach(() => {
  mountTree()
})

describe('rowIndexOf', () => {
  it('finds the row an event came from', () => {
    render()

    expect(rowIndexOf(treeElement(), rowFor('notes.md'))).toBe(1)
  })

  it('finds the row when the event came from something inside it', () => {
    render()
    const inner = rowFor('notes.md').querySelector('.tree__name')

    expect(rowIndexOf(treeElement(), inner)).toBe(1)
  })

  it('reports no row for the container itself', () => {
    render()

    expect(rowIndexOf(treeElement(), treeElement())).toBeNull()
  })

  it('reports no row for a target that is not an element at all', () => {
    render()

    expect(rowIndexOf(treeElement(), new EventTarget())).toBeNull()
  })

  it('reports no row for one that belongs to a different tree', () => {
    render()
    const other = document.createElement('div')
    other.append(rowFor('notes.md').cloneNode(true))

    expect(rowIndexOf(treeElement(), other.querySelector('.tree__row'))).toBeNull()
  })

  it('reports no row for no target', () => {
    render()

    expect(rowIndexOf(treeElement(), null)).toBeNull()
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
    document.body.append(treeElement())
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

describe('isStoreRow', () => {
  const DOCUMENT: VisibleRow = { path: 'notes.md', expandable: false, kind: 'document', opens: '/doc/notes.md' }

  it('holds for a row the store owns, which is what a move may act on', () => {
    expect(isStoreRow(DOCUMENT)).toBe(true)
  })

  it('does not hold for a trashed entry, which is not in the store any more', () => {
    expect(isStoreRow({ ...DOCUMENT, kind: 'trash-entry' })).toBe(false)
  })

  it('does not hold where there is no row at all', () => {
    expect(isStoreRow(undefined)).toBe(false)
  })
})

describe('what a drawn row carries', () => {
  function drawRow(overrides: Partial<Parameters<typeof row>[0]> = {}): HTMLElement {
    return row(
      {
        path: 'notes.md',
        kind: 'document',
        name: 'notes.md',
        depth: 0,
        expanded: null,
        selected: false,
        ...overrides,
      },
      new Map(),
    )
  }

  it('is draggable when the caller asked for it, which is what starts a move', () => {
    expect(drawRow({ draggable: true }).draggable).toBe(true)
  })

  it('is left alone when the caller did not ask, rather than being marked draggable', () => {
    expect(drawRow().draggable).not.toBe(true)
  })

  it('claims no expanded state for a row that cannot expand', () => {
    expect(drawRow().hasAttribute('aria-expanded')).toBe(false)
  })

  it('reports an expanded folder as expanded', () => {
    expect(drawRow({ kind: 'folder', expanded: true }).getAttribute('aria-expanded')).toBe('true')
  })

  it('shows no twisty for a row that cannot expand', () => {
    expect(drawRow().querySelector('.tree__twisty')?.textContent).toBe('')
  })

  it('shows a twisty pointing down for an open folder', () => {
    expect(drawRow({ kind: 'folder', expanded: true }).querySelector('.tree__twisty')?.textContent).toBe('expand_more')
  })

  it('shows a twisty pointing right for a shut folder', () => {
    expect(drawRow({ kind: 'folder', expanded: false }).querySelector('.tree__twisty')?.textContent).toBe(
      'chevron_right',
    )
  })
})

describe('which row the keyboard can reach first', () => {
  function tabindexes(): Array<string | null> {
    return rows().map((element) => element.getAttribute('tabindex'))
  }

  it('reaches the selected row, so the keyboard starts where the reader is', () => {
    render({ selected: 'notes.md' })

    applyRovingTabindex(treeElement())

    expect(tabindexes()).toStrictEqual(['-1', '0', '-1'])
  })

  it('reaches the first row when nothing is selected, rather than reaching none', () => {
    render()

    applyRovingTabindex(treeElement())

    expect(tabindexes()).toStrictEqual(['0', '-1', '-1'])
  })
})
