'use sanity'

import { given } from '../../../conditions.ts'
import { beforeEach, describe, expect, it } from 'vitest'

import type { TreeNode } from '../../../../src/client/browser/tree/tree-model.ts'
import { renderTree } from '../../../../src/client/browser/tree/tree-view.ts'

import { mountTree, pathsShown, render, rowFor, rows, SAMPLE, treeElement } from './render-fixtures.ts'

function iconOf(entryPath: string): string {
  return rowFor(entryPath).querySelector('.tree__icon')?.textContent ?? ''
}

function twistyOf(entryPath: string): string {
  return rowFor(entryPath).querySelector('.tree__twisty')?.textContent ?? ''
}

beforeEach(() => {
  mountTree()
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
    const glyphs = [...treeElement().querySelectorAll<HTMLElement>('.icon')]
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
})

describe('an empty store', () => {
  it('renders no rows at all, since the trash is no longer in the tree', () => {
    const empty: readonly TreeNode[] = []
    renderTree(treeElement(), { nodes: empty, open: new Set(), selected: null })

    expect(pathsShown()).toStrictEqual([])
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

describe('which rows report themselves as expandable', () => {
  function visibleFor(entryPath: string): boolean | undefined {
    const visible = renderTree(treeElement(), { nodes: SAMPLE, open: new Set(), selected: null })

    return visible.find((row) => row.path === entryPath)?.expandable
  }

  it('marks a folder expandable, which is what an arrow key acts on', () => {
    expect(visibleFor('journal')).toBe(true)
  })

  it('marks a document as not expandable, so an arrow key leaves it to the browser', () => {
    expect(visibleFor('notes.md')).toBe(false)
  })
})
