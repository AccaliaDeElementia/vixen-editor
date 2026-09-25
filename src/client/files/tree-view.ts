'use sanity'

import { docUrlFor } from '../doc-path.ts'

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

function row(options: RowOptions): HTMLElement {
  const element = document.createElement(options.href === undefined ? 'div' : 'a')
  if (element instanceof HTMLAnchorElement && options.href !== undefined) element.href = options.href

  element.className = 'tree__row'
  element.setAttribute('role', 'treeitem')
  element.setAttribute('aria-selected', String(options.selected))
  element.setAttribute('tabindex', '-1')
  element.style.setProperty('--depth', String(options.depth))
  element.dataset.path = options.path
  element.dataset.kind = options.kind
  if (options.draggable === true) element.draggable = true

  if (options.expanded !== null) element.setAttribute('aria-expanded', String(options.expanded))

  element.append(
    twisty(options.expanded),
    icon(ENTRY_ICONS[options.kind === 'trash-root' ? 'folder' : options.kind], options.kind),
    label(options.name),
  )

  return element
}

interface ActionSpec {
  name: string
  glyph: string
  label: string
  danger: boolean
}

function action(spec: ActionSpec, entry: TrashNode): HTMLElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = spec.danger ? 'tree__action tree__action--danger' : 'tree__action'
  element.dataset.action = spec.name
  element.dataset.trashId = entry.id
  element.setAttribute('aria-label', spec.label)

  element.title = spec.label

  const symbol = document.createElement('span')
  symbol.className = 'icon'
  symbol.setAttribute('aria-hidden', 'true')
  symbol.textContent = spec.glyph
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
      visible.push({ path: node.path, expandable: false, kind: node.kind })
      continue
    }

    const expanded = model.open.has(node.path)
    const element = item(
      row({ path: node.path, kind: 'folder', name: node.name, depth, expanded, selected, draggable: true }),
    )
    items.push(element)
    visible.push({ path: node.path, expandable: true, kind: 'folder' })

    if (!expanded) continue

    const nested = renderNodes(node.children, model, depth + 1)
    const children = group()
    children.append(...nested.items)
    element.append(children)
    visible.push(...nested.visible)
  }

  return { items, visible }
}

function renderTrash(model: TreeViewModel): Rendered {
  const expanded = model.open.has(TRASH_PATH)
  const name = `Trash (${String(model.trash.length)})`
  const element = item(row({ path: TRASH_PATH, kind: 'trash-root', name, depth: 0, expanded, selected: false }))
  const visible: VisibleRow[] = [{ path: TRASH_PATH, expandable: true, kind: 'trash-root' }]

  if (!expanded) return { items: [element], visible }

  const children = group()
  for (const entry of model.trash) {
    const deleted = row({
      path: entry.originalPath,
      kind: entry.kind,
      name: entry.originalPath,
      depth: 1,
      expanded: null,
      selected: false,
    })
    deleted.dataset.trashId = entry.id
    deleted.title = `Deleted ${entry.deletedAt}`
    deleted.append(trashActions(entry))
    children.append(item(deleted))
    visible.push({ path: entry.originalPath, expandable: false, kind: 'trash-entry' })
  }
  element.append(children)

  return { items: [element], visible }
}

function applyRovingTabindex(tree: Element): void {
  const rows = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  const focusable = rows.find((candidate) => candidate.getAttribute('aria-selected') === 'true') ?? rows[0]

  focusable?.setAttribute('tabindex', '0')
}

export function renderTree(tree: Element, model: TreeViewModel): VisibleRow[] {
  const main = renderNodes(model.nodes, model, 0)
  const bin = renderTrash(model)

  tree.replaceChildren(...main.items, ...bin.items)
  applyRovingTabindex(tree)

  return [...main.visible, ...bin.visible]
}

export function rowIndexOf(tree: Element, target: EventTarget | null): number | null {
  const element = target instanceof Element ? target.closest<HTMLElement>(ROW_SELECTOR) : null
  if (element === null) return null

  const index = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)].indexOf(element)

  return index === -1 ? null : index
}
