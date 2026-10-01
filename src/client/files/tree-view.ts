'use sanity'

import { NOT_FOUND, SEQUENCE_START } from '../../shared/sequences.ts'

import { docUrlFor } from '../doc-path.ts'
import { trashUrlFor } from '../../shared/page-urls.ts'

import type { TrashNode, TreeNode } from './tree-model.ts'
import type { EntryKind } from '../../shared/documents.ts'

export const TREE_SELECTOR = '#file-tree'
export const ROW_SELECTOR = '[role="treeitem"]'
export const TRASH_PATH = '.trash'

const ENTRY_ICONS: Readonly<Record<EntryKind, string>> = {
  folder: 'folder',
  document: 'description',
  image: 'image',
}

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
  const element = document.createElement('span')
  element.className = `icon tree__icon tree__icon--${modifier}`
  element.setAttribute('aria-hidden', 'true')
  element.textContent = name

  return element
}

function twisty(expanded: boolean | null): HTMLElement {
  const element = document.createElement('span')
  element.className = 'icon tree__twisty'
  element.setAttribute('aria-hidden', 'true')
  element.textContent = expanded === null ? '' : expanded ? 'expand_more' : 'chevron_right'

  return element
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

function rowElement(href: string | undefined): HTMLElement {
  if (href === undefined) return document.createElement('div')

  const anchor = document.createElement('a')
  anchor.href = href

  return anchor
}

function row(options: RowOptions): HTMLElement {
  const { path, kind, draggable, name, depth, expanded, selected, href } = options
  const element = rowElement(href)

  element.className = 'tree__row'
  element.setAttribute('role', 'treeitem')
  element.setAttribute('aria-selected', String(selected))
  element.setAttribute('tabindex', '-1')
  element.style.setProperty('--depth', String(depth))
  element.dataset.path = path
  element.dataset.kind = kind
  if (draggable === true) element.draggable = true

  if (expanded !== null) element.setAttribute('aria-expanded', String(expanded))

  element.append(twisty(expanded), icon(ENTRY_ICONS[kind === 'trash-root' ? 'folder' : kind], kind), label(name))

  return element
}

interface ActionSpec {
  name: string
  glyph: string
  label: string
  danger: boolean
}

function action(spec: ActionSpec, entry: TrashNode): HTMLElement {
  const { name, glyph, label: description, danger } = spec
  const { id } = entry
  const element = document.createElement('button')
  element.type = 'button'
  element.className = danger ? 'tree__action tree__action--danger' : 'tree__action'
  element.dataset.action = name
  element.dataset.trashId = id
  element.setAttribute('aria-label', description)

  element.title = description

  const symbol = document.createElement('span')
  symbol.className = 'icon'
  symbol.setAttribute('aria-hidden', 'true')
  symbol.textContent = glyph
  element.append(symbol)

  return element
}

// A clock-arrow against a crossed-out bin: two trash-can glyphs side by side
// read as the same button at this size, whatever their detail.
function trashActions(entry: TrashNode): HTMLElement {
  const element = document.createElement('span')
  element.className = 'tree__actions'
  element.append(
    action({ name: 'restore', glyph: 'restore', label: `Restore ${entry.originalPath}`, danger: false }, entry),
    action(
      { name: 'purge', glyph: 'delete_forever', label: `Delete ${entry.originalPath} for good`, danger: true },
      entry,
    ),
  )

  return element
}

function group(): HTMLElement {
  const element = document.createElement('ul')
  element.className = 'tree__group'
  element.setAttribute('role', 'group')

  return element
}

function item(content: HTMLElement): HTMLElement {
  const element = document.createElement('li')
  element.setAttribute('role', 'none')
  element.append(content)

  return element
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
      items.push(item(row({ ...options, draggable: true })))
      visible.push({ path: node.path, expandable: false, kind: node.kind, opens: href })
      continue
    }

    const expanded = model.open.has(node.path)
    const element = item(
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

function renderTrash(model: TreeViewModel): Rendered {
  const expanded = model.open.has(TRASH_PATH)
  const name = `Trash (${String(model.trash.length)})`
  const element = item(
    row({ path: TRASH_PATH, kind: 'trash-root', name, depth: ROOT_DEPTH, expanded, selected: false }),
  )
  const visible: VisibleRow[] = [{ path: TRASH_PATH, expandable: true, kind: 'trash-root', opens: null }]

  if (!expanded) return { items: [element], visible }

  const children = group()
  for (const entry of model.trash) {
    const { id, originalPath, kind, deletedAt } = entry
    const href = trashUrlFor(id)
    const deleted = row({
      path: originalPath,
      kind,
      name: originalPath,
      depth: TRASH_ENTRY_DEPTH,
      expanded: null,
      selected: false,
      href,
    })
    deleted.dataset.trashId = id
    deleted.title = `Deleted ${deletedAt}`
    deleted.append(trashActions(entry))
    children.append(item(deleted))
    visible.push({ path: originalPath, expandable: false, kind: 'trash-entry', opens: href })
  }
  element.append(children)

  return { items: [element], visible }
}

function applyRovingTabindex(tree: Element): void {
  const rows = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  const focusable = rows.find((candidate) => candidate.getAttribute('aria-selected') === 'true') ?? rows[SEQUENCE_START]

  focusable?.setAttribute('tabindex', '0')
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
