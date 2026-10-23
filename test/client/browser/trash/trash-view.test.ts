'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import type { TrashNode } from '../../../../src/client/browser/tree/tree-model.ts'
import { joinPath } from '../../../../src/shared/store-path.ts'
import { renderTrashPanel, TRASH_PATH } from '../../../../src/client/browser/trash/trash-view.ts'

const GLYPH_TRASH_ENTRY: TrashNode = {
  id: 'bbbb',
  originalPath: 'journal/glyphs.md',
  kind: 'document',
  deletedAt: '2026-01-01T00:00:00.000Z',
}

let list: HTMLElement = document.createElement('ul')

beforeEach(() => {
  document.body.innerHTML = '<ul id="trash-list" role="tree"></ul>'
  const deleted = document.body.querySelector<HTMLElement>('#trash-list')
  if (deleted === null) throw new Error('missing trash list')
  list = deleted
})

describe('accessibility', () => {
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

describe('what a trashed row says it can do', () => {
  it('reports it as not expandable, because a trashed entry opens on its own page', () => {
    const visible = renderTrashPanel(list, { trash: [GLYPH_TRASH_ENTRY], selected: null })

    expect(visible.at(0)?.expandable).toBe(false)
  })
})
