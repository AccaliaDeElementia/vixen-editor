'use sanity'

import { given } from '../../../conditions.ts'
import { beforeEach, describe, expect, it } from 'vitest'

import { parseTree } from '../../../../src/client/browser/tree/tree-model.ts'
import { rowIndexOf } from '../../../../src/client/browser/tree/drawing.ts'

import { mountTree, pathsShown, render, rowFor, treeElement } from './render-fixtures.ts'

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
