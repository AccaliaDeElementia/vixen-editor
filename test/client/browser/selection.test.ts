'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createSelection } from '../../../src/client/browser/selection.ts'
import { TRASH_PATH } from '../../../src/client/browser/trash/trash-view.ts'
import type { VisibleRow } from '../../../src/client/browser/tree/drawing.ts'
import { archiveUrlFor } from '../../../src/shared/api.ts'
import { joinPath, STORE_ROOT } from '../../../src/shared/store-path.ts'

import { given } from '../../conditions.ts'
import { renderPage } from '../templates.ts'

const FOLDER = 'journal'
const NESTED = 'journal/entry.md'
const LOOSE = 'notes.md'
const DELETED = joinPath(TRASH_PATH, 'aaaa')

const ROWS: readonly VisibleRow[] = [
  { path: FOLDER, expandable: true, kind: 'folder', opens: null },
  { path: NESTED, expandable: false, kind: 'document', opens: `/doc/${NESTED}` },
  { path: LOOSE, expandable: false, kind: 'document', opens: `/doc/${LOOSE}` },
  { path: DELETED, expandable: false, kind: 'trash-entry', opens: `/trash/aaaa` },
]

let root: ParentNode = document

function rowElements(): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-path]')]
}

function selectionStartingAt(startingAt: string): ReturnType<typeof createSelection> {
  return createSelection({ root, shown: () => ROWS, elements: rowElements, startingAt })
}

function rowFor(entryPath: string): HTMLElement {
  const found = rowElements().find((element) => element.dataset.path === entryPath)
  if (found === undefined) throw new Error(`no row for ${entryPath}`)

  return found
}

function insertButton(): HTMLButtonElement {
  const element = root.querySelector<HTMLButtonElement>('#insert-entry')
  if (element === null) throw new Error('missing the insert button')

  return element
}

function archiveHref(): string | null {
  return root.querySelector<HTMLAnchorElement>('#download-archive')?.getAttribute('href') ?? null
}

beforeEach(() => {
  document.body.innerHTML = renderPage()
  ;({ body: root } = document)
  const tree = root.querySelector('#file-tree')
  for (const { path } of ROWS) {
    const row = document.createElement('a')
    row.dataset.path = path
    tree?.append(row)
  }
})

describe('what the browser has selected', () => {
  it('starts at the path it was opened on', () => {
    expect(selectionStartingAt(LOOSE).selectedPath()).toBe(LOOSE)
  })

  it('follows a plain selection', () => {
    const selection = selectionStartingAt(LOOSE)

    selection.select(NESTED)

    expect(selection.selectedPath()).toBe(NESTED)
  })

  it('leaves the rows alone on a plain selection, because a redraw is about to replace them', () => {
    const selection = selectionStartingAt(LOOSE)

    selection.select(NESTED)

    expect(rowFor(NESTED).hasAttribute('aria-selected')).toBe(false)
  })
})

describe('marking a row as the selection', () => {
  it('follows it', () => {
    const selection = selectionStartingAt(LOOSE)

    selection.markSelected(NESTED)

    expect(selection.selectedPath()).toBe(NESTED)
  })

  it('says so on the row itself', () => {
    selectionStartingAt(LOOSE).markSelected(NESTED)

    expect(rowFor(NESTED).getAttribute('aria-selected')).toBe('true')
  })

  it('says false on the rows that are not selected, rather than omitting the attribute', () => {
    selectionStartingAt(LOOSE).markSelected(NESTED)

    expect(rowFor(LOOSE).getAttribute('aria-selected')).toBe('false')
  })

  it('brings the toolbar into step without waiting for a redraw', () => {
    selectionStartingAt(DELETED).markSelected(NESTED)

    expect(insertButton().disabled).toBe(false)
  })
})

describe('whether the selection is on screen', () => {
  it('is the selection when a row for it is being shown', () => {
    expect(selectionStartingAt(NESTED).visibleSelection()).toBe(NESTED)
  })

  it('is nothing when the selection sits inside a folder that is closed', () => {
    expect(selectionStartingAt('journal/2026/hidden.md').visibleSelection()).toBeNull()
  })
})

describe('what the insert button would insert', () => {
  it('is the selected document', () => {
    expect(selectionStartingAt(NESTED).insertableSelection()).toBe(NESTED)
  })

  it('is nothing for a deleted entry, which no document can link to', () => {
    expect(selectionStartingAt(DELETED).insertableSelection()).toBeNull()
  })

  it('is nothing when the selection is not on screen', () => {
    expect(selectionStartingAt('journal/2026/hidden.md').insertableSelection()).toBeNull()
  })
})

describe('where a new entry would be created', () => {
  it('is inside the folder when a folder is selected', () => {
    expect(selectionStartingAt(FOLDER).targetDirectory()).toBe(FOLDER)
  })

  it('is beside a selected document, in the folder holding it', () => {
    expect(selectionStartingAt(NESTED).targetDirectory()).toBe(FOLDER)
  })

  it('is the store root for a document sitting loose in it', () => {
    expect(selectionStartingAt(LOOSE).targetDirectory()).toBe(STORE_ROOT)
  })

  it('is the store root for a deleted entry, since nothing is created in the trash', () => {
    expect(selectionStartingAt(DELETED).targetDirectory()).toBe(STORE_ROOT)
  })

  it('is the store root when the selection is not on screen at all', () => {
    expect(selectionStartingAt('journal/2026/hidden.md').targetDirectory()).toBe(STORE_ROOT)
  })
})

describe('bringing the toolbar into step with the selection', () => {
  it('points the archive link at the folder a download would take', () => {
    selectionStartingAt(NESTED).reflect()

    expect(archiveHref()).toBe(archiveUrlFor(FOLDER))
  })

  it('offers insert when the selection is something a document can link to', () => {
    selectionStartingAt(NESTED).reflect()

    expect(insertButton().disabled).toBe(false)
  })

  it('withholds insert when the selection is in the trash', () => {
    const selection = selectionStartingAt(NESTED)
    selection.reflect()
    given(() => {
      expect(insertButton().disabled).toBe(false)
    })

    selectionStartingAt(DELETED).reflect()

    expect(insertButton().disabled).toBe(true)
  })
})
