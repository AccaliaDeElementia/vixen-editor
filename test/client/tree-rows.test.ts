'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { given } from '../conditions.ts'
import {
  treeRow,
  decorativeIcon,
  ENTRY_GLYPHS,
  focusRowAt,
  makeReachable,
  treeGroup,
  treeItem,
} from '../../src/client/tree-rows.ts'

beforeEach(() => {
  document.body.innerHTML = ''
})

function rowsIn(count: number): HTMLElement[] {
  const rows = Array.from({ length: count }, () => document.createElement('div'))
  for (const row of rows) {
    row.tabIndex = -1
    document.body.append(row)
  }

  return rows
}

describe('a glyph that stands for a kind of entry', () => {
  it('is the same glyph wherever a tree draws that kind', () => {
    expect(ENTRY_GLYPHS).toStrictEqual({ folder: 'folder', document: 'description', image: 'image' })
  })
})

describe('an icon that carries no meaning of its own', () => {
  it('is skipped by anything reading the row aloud', () => {
    expect(decorativeIcon('folder', 'icon').getAttribute('aria-hidden')).toBe('true')
  })

  it('shows the glyph it was given', () => {
    expect(decorativeIcon('folder', 'icon').textContent).toBe('folder')
  })

  it('wears the class its tree styles it with', () => {
    expect(decorativeIcon('folder', 'tree__icon').className).toBe('tree__icon')
  })
})

describe('the nesting a tree is read through', () => {
  it('groups what sits under a row', () => {
    expect(treeGroup('tree__group').getAttribute('role')).toBe('group')
  })

  it('leaves the list item itself out of the reading', () => {
    expect(treeItem(document.createElement('div')).getAttribute('role')).toBe('none')
  })

  it('holds the row it was built around', () => {
    const row = document.createElement('div')

    expect(treeItem(row).firstElementChild).toBe(row)
  })
})

describe('a row inside a tree', () => {
  function placed(depth = 0): HTMLElement {
    return treeRow({ path: 'journal/a.md', kind: 'document', depth })
  }

  it('reads as an item of the tree', () => {
    expect(placed().getAttribute('role')).toBe('treeitem')
  })

  it('stays out of the tab order until the tree hands it the one stop', () => {
    expect(placed().getAttribute('tabindex')).toBe('-1')
  })

  it('carries the path it stands for', () => {
    expect(placed().dataset.path).toBe('journal/a.md')
  })

  it('carries the kind it stands for', () => {
    expect(placed().dataset.kind).toBe('document')
  })

  it('says how deep it sits, so the stylesheet owns the indent', () => {
    expect(placed(2).style.getPropertyValue('--depth')).toBe('2')
  })

  it('is a real link when it opens something, so a new tab comes for free', () => {
    const opening = treeRow({ path: 'journal/a.md', kind: 'document', depth: 0 }, '/doc/journal/a.md')

    expect(opening).toBeInstanceOf(HTMLAnchorElement)
  })

  it('carries where it goes', () => {
    const opening = treeRow({ path: 'journal/a.md', kind: 'document', depth: 0 }, '/doc/journal/a.md')

    expect(opening.getAttribute('href')).toBe('/doc/journal/a.md')
  })

  it('is no link at all when it opens nothing', () => {
    expect(placed()).toBeInstanceOf(HTMLDivElement)
  })
})

describe('the one stop a tree offers the tab key', () => {
  it('lands on the row the tree chose', () => {
    const rows = rowsIn(3)

    makeReachable(rows, 1)

    expect(rows.map((row) => row.tabIndex)).toStrictEqual([-1, 0, -1])
  })

  it('moves with the focus', () => {
    const rows = rowsIn(3)
    makeReachable(rows, 0)

    focusRowAt(rows, 2)

    expect(rows.map((row) => row.tabIndex)).toStrictEqual([-1, -1, 0])
  })

  it('takes the focus with it', () => {
    const rows = rowsIn(3)

    focusRowAt(rows, 2)

    expect(document.activeElement).toBe(rows.at(2))
  })

  it('says so when it moved', () => {
    expect(focusRowAt(rowsIn(3), 2)).toBe(true)
  })

  it('refuses a row that is not there, rather than clearing every stop', () => {
    const rows = rowsIn(3)
    makeReachable(rows, 1)
    given(() => {
      expect(focusRowAt(rows, 9)).toBe(false)
    })

    expect(rows.map((row) => row.tabIndex)).toStrictEqual([-1, 0, -1])
  })
})
