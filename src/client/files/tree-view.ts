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

function icon(name: string, modifier: string): HTMLElement {
  return decorativeIcon(name, `icon tree__icon tree__icon--${modifier}`)
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

function row(options: RowOptions): HTMLElement {
  const { path, kind, draggable, name, depth, expanded, selected, href } = options
  const element = treeRow({ path, kind, depth }, href)

  element.className = 'tree__row'
  element.setAttribute('aria-selected', String(selected))
  if (draggable === true) element.draggable = true

  if (expanded !== null) element.setAttribute('aria-expanded', String(expanded))

  element.append(twisty(expanded), icon(ENTRY_GLYPHS[kind === 'trash-root' ? 'folder' : kind], kind), label(name))

  return element
}

function group(): HTMLElement {
  return treeGroup('tree__group')
}

interface Rendered {
  items: HTMLElement[]
  visible: VisibleRow[]
}

function renderNodes(nodes: readonly TreeNode[], model: TreeViewModel, depth: number): Rendered {
  const items: HTMLElement[] = []
  const visible: VisibleRow[] = []

  for (const node of nodes) {
    const selected = node.path === model.selected

    if (node.kind !== 'folder') {
      const href = docUrlFor(node.path)
      const options = { path: node.path, kind: node.kind, name: node.name, depth, expanded: null, selected, href }
      items.push(treeItem(row({ ...options, draggable: true })))
      visible.push({ path: node.path, expandable: false, kind: node.kind, opens: href })
      continue
    }

    const expanded = model.open.has(node.path)
    const element = treeItem(
      row({ path: node.path, kind: 'folder', name: node.name, depth, expanded, selected, draggable: true }),
    )
    items.push(element)
    visible.push({ path: node.path, expandable: true, kind: 'folder', opens: null })

    if (!expanded) continue

    const nested = renderNodes(node.children, model, depth + ONE_LEVEL_DEEPER)
    const children = group()
    children.append(...nested.items)
    element.append(children)
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

function renderTrash(model: TreeViewModel): Rendered {
  const expanded = model.open.has(TRASH_PATH)
  const name = `Trash (${String(model.trash.length)})`
  const trashRow = row({
    path: TRASH_PATH,
    kind: 'trash-root',
    name,
    depth: ROOT_DEPTH,
    selected: model.selected === TRASH_PATH,
    expanded,
  })
  if (model.trash.length > NOTHING_DELETED) trashRow.append(emptyTrashAction(model.trash.length))

  const element = treeItem(trashRow)
  const visible: VisibleRow[] = [{ path: TRASH_PATH, expandable: true, kind: 'trash-root', opens: null }]

  if (!expanded) return { items: [element], visible }

  const children = group()
  for (const entry of model.trash) {
    const { id, originalPath, kind, deletedAt } = entry
    const href = trashUrlFor(id)
    const entryKey = joinPath(TRASH_PATH, id)
    const deleted = row({
      path: entryKey,
      kind,
      name: originalPath,
      depth: TRASH_ENTRY_DEPTH,
      expanded: null,
      selected: model.selected === entryKey,
      href,
    })
    deleted.dataset.trashId = id
    deleted.title = `Deleted ${deletedAt}`
    children.append(treeItem(deleted))
    visible.push({ path: entryKey, expandable: false, kind: 'trash-entry', opens: href })
  }
  element.append(children)

  return { items: [element], visible }
}

function applyRovingTabindex(tree: Element): void {
  const rows = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  const selected = rows.findIndex((candidate) => candidate.getAttribute('aria-selected') === 'true')

  makeReachable(rows, selected === NOT_FOUND ? SEQUENCE_START : selected)
}

export function renderTree(tree: Element, model: TreeViewModel): VisibleRow[] {
  const main = renderNodes(model.nodes, model, ROOT_DEPTH)
  const bin = renderTrash(model)

  tree.replaceChildren(...main.items, ...bin.items)
  applyRovingTabindex(tree)

  return [...main.visible, ...bin.visible]
}

export function rowIndexOf(tree: Element, target: EventTarget | null): number | null {
  const element = target instanceof Element ? target.closest<HTMLElement>(ROW_SELECTOR) : null
  if (element === null) return null

  const index = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)].indexOf(element)

  return index === NOT_FOUND ? null : index
}
