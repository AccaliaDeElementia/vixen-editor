'use sanity'

import {
  applyRovingTabindex,
  drawnIn,
  itemFor,
  ROOT_DEPTH,
  row,
  syncChildren,
  type VisibleRow,
} from '../tree/drawing.ts'

import { trashUrlFor } from '../../../shared/page-urls.ts'
import { joinPath } from '../../../shared/store-path.ts'

import type { TrashNode } from '../tree/tree-model.ts'

export const TRASH_PATH = '.trash'
export const TRASH_LIST_SELECTOR = '#trash-list'

interface TrashViewModel {
  trash: readonly TrashNode[]
  selected: string | null
}

function trashRowFor(entry: TrashNode, model: TrashViewModel, drawn: Map<string, HTMLElement>): HTMLElement {
  const { id, originalPath, kind, deletedAt } = entry
  const entryKey = joinPath(TRASH_PATH, id)
  const deleted = row(
    {
      path: entryKey,
      kind,
      name: originalPath,
      depth: ROOT_DEPTH,
      expanded: null,
      selected: model.selected === entryKey,
      href: trashUrlFor(id),
    },
    drawn,
  )

  deleted.dataset.trashId = id
  deleted.title = `${originalPath} — deleted ${deletedAt}`

  return deleted
}

export function renderTrashPanel(list: Element, model: TrashViewModel): VisibleRow[] {
  const drawn = drawnIn(list)
  const items: HTMLElement[] = []
  const visible: VisibleRow[] = []

  for (const entry of model.trash) {
    const deleted = trashRowFor(entry, model, drawn)
    const item = itemFor(deleted)
    syncChildren(item, [deleted])
    items.push(item)
    visible.push({
      path: joinPath(TRASH_PATH, entry.id),
      expandable: false,
      kind: 'trash-entry',
      opens: trashUrlFor(entry.id),
    })
  }

  syncChildren(list, items)
  applyRovingTabindex(list)

  return visible
}
