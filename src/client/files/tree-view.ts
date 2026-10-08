'use sanity'

import { NOT_FOUND, SEQUENCE_START } from '../../shared/sequences.ts'

import { decorativeIcon, ENTRY_GLYPHS, makeReachable, treeGroup, treeItem, treeRow } from '../tree-rows.ts'

import { docUrlFor } from '../doc-path.ts'
import { trashUrlFor } from '../../shared/page-urls.ts'
import { joinPath } from '../../shared/store-path.ts'

import type { TrashNode, TreeNode } from './tree-model.ts'
import type { EntryKind } from '../../shared/documents.ts'

export const TREE_SELECTOR = '#file-tree'
export const ROW_SELECTOR = '[role="treeitem"]'
export const TRASH_PATH = '.trash'
export const EMPTY_TRASH_SELECTOR = '.tree__empty-trash'

const NOTHING_DELETED = 0
const ONE_ENTRY = 1

export interface VisibleRow {
  path: string
  expandable: boolean
  kind: RowKind
  opens: string | null
}

type RowKind = EntryKind | 'trash-root' | 'trash-entry'

interface StoreRow extends VisibleRow {
  kind: EntryKind
}

export function isStoreRow(row: VisibleRow | undefined): row is StoreRow {
  return row !== undefined && row.kind !== 'trash-root' && row.kind !== 'trash-entry'
}

export interface TreeViewModel {
  nodes: readonly TreeNode[]
  trash: readonly TrashNode[]
  open: ReadonlySet<string>
  selected: string | null
}

function icon(name: string, tone: string): HTMLElement {
  return decorativeIcon(name, `icon tree__icon icon--${tone}`)
}

function twisty(expanded: boolean | null): HTMLElement {
  return decorativeIcon(expanded === null ? '' : expanded ? 'expand_more' : 'chevron_right', 'icon tree__twisty')
}

function label(text: string): HTMLElement {
  const element = document.createElement('span')
  element.className = 'tree__name'
  element.textContent = text

  return element
}

interface RowOptions {
  path: string
  kind: EntryKind | 'trash-root'
  draggable?: boolean
  name: string
  depth: number
  expanded: boolean | null
  selected: boolean
  href?: string
}

const DRAWN = new WeakMap<Element, Map<string, HTMLElement>>()

function drawnIn(tree: Element): Map<string, HTMLElement> {
  const existing = DRAWN.get(tree)
  if (existing !== undefined) return existing

  const started = new Map<string, HTMLElement>()
  DRAWN.set(tree, started)

  return started
}

function rowIdentity(path: string, kind: EntryKind | 'trash-root'): string {
  return `${kind}:${path}`
}

function row(options: RowOptions, drawn: Map<string, HTMLElement>): HTMLElement {
  const { path, kind, draggable, name, depth, expanded, selected, href } = options
  const shownAs = kind === 'trash-root' ? 'folder' : kind
  const identity = rowIdentity(path, kind)
  const element = drawn.get(identity) ?? treeRow({ path, kind, depth }, href)
  drawn.set(identity, element)

  element.className = 'tree__row'
  element.style.setProperty('--depth', String(depth))
  element.setAttribute('aria-selected', String(selected))
  if (draggable === true) element.draggable = true

  if (expanded === null) element.removeAttribute('aria-expanded')
  else element.setAttribute('aria-expanded', String(expanded))

  element.replaceChildren(twisty(expanded), icon(ENTRY_GLYPHS[shownAs], shownAs), label(name))

  return element
}

function group(): HTMLElement {
  return treeGroup('tree__group')
}

interface Rendered {
  items: HTMLElement[]
  visible: VisibleRow[]
}

function itemFor(shown: HTMLElement): HTMLElement {
  const { parentElement: held } = shown

  return held !== null && held.tagName === 'LI' ? held : treeItem(shown)
}

function groupIn(item: HTMLElement): HTMLElement {
  return item.querySelector<HTMLElement>(':scope > ul') ?? group()
}

function syncChildren(parent: Element, wanted: readonly Element[]): void {
  const { children } = parent
  const keeping = new Set<Element>(wanted)
  for (const child of [...children]) if (!keeping.has(child)) child.remove()

  for (const [at, node] of wanted.entries()) {
    const { [at]: inPlace } = children
    if (inPlace !== node) parent.insertBefore(node, inPlace ?? null)
  }
}

function renderNodes(
  nodes: readonly TreeNode[],
  model: TreeViewModel,
  depth: number,
  drawn: Map<string, HTMLElement>,
): Rendered {
  const items: HTMLElement[] = []
  const visible: VisibleRow[] = []

  for (const node of nodes) {
    const selected = node.path === model.selected

    if (node.kind !== 'folder') {
      const href = docUrlFor(node.path)
      const options = { path: node.path, kind: node.kind, name: node.name, depth, expanded: null, selected, href }
      const shown = row({ ...options, draggable: true }, drawn)
      const item = itemFor(shown)
      syncChildren(item, [shown])
      items.push(item)
      visible.push({ path: node.path, expandable: false, kind: node.kind, opens: href })
      continue
    }

    const expanded = model.open.has(node.path)
    const shown = row(
      { path: node.path, kind: 'folder', name: node.name, depth, expanded, selected, draggable: true },
      drawn,
    )
    const element = itemFor(shown)
    items.push(element)
    visible.push({ path: node.path, expandable: true, kind: 'folder', opens: null })

    if (!expanded) {
      syncChildren(element, [shown])
      continue
    }

    const nested = renderNodes(node.children, model, depth + ONE_LEVEL_DEEPER, drawn)
    const children = groupIn(element)
    syncChildren(children, nested.items)
    syncChildren(element, [shown, children])
    visible.push(...nested.visible)
  }

  return { items, visible }
}

const ROOT_DEPTH = 0
const TRASH_ENTRY_DEPTH = 1
const ONE_LEVEL_DEEPER = 1

function emptyTrashAction(held: number): HTMLElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'tree__empty-trash'
  element.setAttribute('aria-label', `Empty the trash of ${String(held)} ${held === ONE_ENTRY ? 'entry' : 'entries'}`)
  element.title = 'Empty the trash'
  element.append(decorativeIcon('delete_sweep', 'icon'))

  return element
}

function renderTrash(model: TreeViewModel, drawn: Map<string, HTMLElement>): Rendered {
  const expanded = model.open.has(TRASH_PATH)
  const name = `Trash (${String(model.trash.length)})`
  const trashRow = row(
    {
      path: TRASH_PATH,
      kind: 'trash-root',
      name,
      depth: ROOT_DEPTH,
      selected: model.selected === TRASH_PATH,
      expanded,
    },
    drawn,
  )
  if (model.trash.length > NOTHING_DELETED) trashRow.append(emptyTrashAction(model.trash.length))

  const element = itemFor(trashRow)
  const visible: VisibleRow[] = [{ path: TRASH_PATH, expandable: true, kind: 'trash-root', opens: null }]

  if (!expanded) {
    syncChildren(element, [trashRow])

    return { items: [element], visible }
  }

  const children = groupIn(element)
  const held: HTMLElement[] = []
  for (const entry of model.trash) {
    const { id, originalPath, kind, deletedAt } = entry
    const href = trashUrlFor(id)
    const entryKey = joinPath(TRASH_PATH, id)
    const deleted = row(
      {
        path: entryKey,
        kind,
        name: originalPath,
        depth: TRASH_ENTRY_DEPTH,
        expanded: null,
        selected: model.selected === entryKey,
        href,
      },
      drawn,
    )
    deleted.dataset.trashId = id
    deleted.title = `Deleted ${deletedAt}`
    const item = itemFor(deleted)
    syncChildren(item, [deleted])
    held.push(item)
    visible.push({ path: entryKey, expandable: false, kind: 'trash-entry', opens: href })
  }

  syncChildren(children, held)
  syncChildren(element, [trashRow, children])

  return { items: [element], visible }
}

function applyRovingTabindex(tree: Element): void {
  const rows = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  const selected = rows.findIndex((candidate) => candidate.getAttribute('aria-selected') === 'true')

  makeReachable(rows, selected === NOT_FOUND ? SEQUENCE_START : selected)
}

export function renderTree(tree: Element, model: TreeViewModel): VisibleRow[] {
  const drawn = drawnIn(tree)
  const main = renderNodes(model.nodes, model, ROOT_DEPTH, drawn)
  const bin = renderTrash(model, drawn)

  syncChildren(tree, [...main.items, ...bin.items])
  applyRovingTabindex(tree)

  return [...main.visible, ...bin.visible]
}

export function rowIndexOf(tree: Element, target: EventTarget | null): number | null {
  const element = target instanceof Element ? target.closest<HTMLElement>(ROW_SELECTOR) : null
  if (element === null) return null

  const index = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)].indexOf(element)

  return index === NOT_FOUND ? null : index
}
