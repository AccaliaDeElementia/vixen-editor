'use sanity'

import { updateArchiveLink, updateInsertAvailability } from './actions.ts'
import { directoryOf } from '../../shared/link-paths.ts'
import { isAtOrUnder, STORE_ROOT } from '../../shared/store-path.ts'
import { TRASH_PATH } from './trash/trash-view.ts'
import type { VisibleRow } from './tree/drawing.ts'

interface Selecting {
  root: ParentNode
  shown: () => readonly VisibleRow[]
  elements: () => HTMLElement[]
  startingAt: string
}

interface Selection {
  selectedPath: () => string
  select: (entryPath: string) => void
  markSelected: (entryPath: string) => void
  reflect: () => void
  visibleSelection: () => string | null
  insertableSelection: () => string | null
  targetDirectory: () => string
}

export function createSelection({ elements, root, shown, startingAt }: Selecting): Selection {
  let selected = startingAt

  function selectedPath(): string {
    return selected
  }

  function visibleSelection(): string | null {
    return shown().some((row) => row.path === selected) ? selected : null
  }

  function insertableSelection(): string | null {
    const entryPath = visibleSelection()
    if (entryPath === null || isAtOrUnder(TRASH_PATH, entryPath)) return null

    return entryPath
  }

  function targetDirectory(): string {
    if (isAtOrUnder(TRASH_PATH, selected)) return STORE_ROOT

    const row = shown().find((candidate) => candidate.path === selected)
    if (row === undefined) return STORE_ROOT

    return row.expandable ? selected : directoryOf(selected)
  }

  function reflect(): void {
    updateArchiveLink(root, targetDirectory())
    updateInsertAvailability(root, insertableSelection())
  }

  function select(entryPath: string): void {
    selected = entryPath
  }

  function markSelected(entryPath: string): void {
    select(entryPath)
    for (const element of elements()) element.setAttribute('aria-selected', String(element.dataset.path === entryPath))

    reflect()
  }

  return { selectedPath, select, markSelected, reflect, visibleSelection, insertableSelection, targetDirectory }
}
