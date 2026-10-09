'use sanity'

import { KEYS } from '../../platform/help.ts'
import { docUrlFor } from '../../platform/doc-path.ts'

import { ancestorsOf } from './tree-model.ts'
import { focusRowAt } from './tree-rows.ts'
import type { VisibleRow } from './tree-view.ts'

const NEXT_ROW = 1
const PREVIOUS_ROW = -1
const LAST_ANCESTOR = -1

interface Navigating {
  shown: () => readonly VisibleRow[]
  elements: () => HTMLElement[]
  isOpen: (entryPath: string) => boolean
  toggle: (entryPath: string) => void
  select: (entryPath: string) => void
  navigate: (url: string) => void
}

interface TreeKeyboard {
  indexOfPath: (entryPath: string) => number
  focusAt: (index: number) => boolean
  handleKey: (key: string, current: VisibleRow) => boolean
  openRow: (current: VisibleRow) => boolean
  openFolderIndex: (current: VisibleRow) => void
}

export function createTreeKeyboard(options: Navigating): TreeKeyboard {
  const { isOpen, toggle, select, navigate } = options

  function indexOfPath(entryPath: string): number {
    return options.shown().findIndex((candidate) => candidate.path === entryPath)
  }

  function focusAt(index: number): boolean {
    const { [index]: row } = options.shown()
    if (row === undefined) return false

    focusRowAt(options.elements(), index)
    select(row.path)

    return true
  }

  function expandOrDescend(current: VisibleRow, index: number): boolean {
    if (!current.expandable) return false
    if (!isOpen(current.path)) {
      toggle(current.path)
      return true
    }

    return focusAt(index + NEXT_ROW)
  }

  function collapseOrAscend(current: VisibleRow, index: number): boolean {
    if (current.expandable && isOpen(current.path)) {
      toggle(current.path)
      return true
    }

    const parent = ancestorsOf(current.path).at(LAST_ANCESTOR)

    return parent !== undefined && focusAt(indexOfPath(parent))
  }

  function openFolderIndex(current: VisibleRow): void {
    navigate(`${docUrlFor(current.path)}/`)
  }

  function openRow(current: VisibleRow): boolean {
    if (current.opens === null) return false

    navigate(current.opens)

    return true
  }

  function activate(current: VisibleRow): boolean {
    if (!current.expandable) return openRow(current)

    toggle(current.path)
    return true
  }

  function handleKey(key: string, current: VisibleRow): boolean {
    const index = options.shown().indexOf(current)

    if (key === KEYS.nextRow) return focusAt(index + NEXT_ROW)
    if (key === KEYS.previousRow) return focusAt(index + PREVIOUS_ROW)
    if (key === KEYS.expandRow) return expandOrDescend(current, index)
    if (key === KEYS.collapseRow) return collapseOrAscend(current, index)
    if (key === KEYS.openRow) return activate(current)

    return false
  }

  return { indexOfPath, focusAt, handleKey, openRow, openFolderIndex }
}
