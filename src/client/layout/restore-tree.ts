'use sanity'

import { createRestoreSelection, type RestoreSelection, type TickState } from './restore-selection.ts'
import type { TrashEntryNode } from '../files/trash-entry.ts'
import type { EntryKind } from '../../shared/documents.ts'
import { KEYS } from '../help.ts'

const ROW_CLASS = 'restore-tree__row'
const ROOT_DEPTH = 0
const ONE_LEVEL_DEEPER = 1
const INDENT_EM = 1.1
const REACHABLE = 0
const PASSED_OVER = -1
const FIRST_ROW = 0
const ONE_ROW = 1

const GLYPHS: Record<EntryKind, string> = { folder: 'folder', document: 'description', image: 'image' }

interface Tick {
  checked: string
  glyph: string
}

const TICKS: Record<TickState, Tick> = {
  on: { checked: 'true', glyph: 'check_box' },
  off: { checked: 'false', glyph: 'check_box_outline_blank' },
  mixed: { checked: 'mixed', glyph: 'indeterminate_check_box' },
}

const RESTORE_ROW_SELECTOR = `.${ROW_CLASS}`

export interface RestoreTree {
  roots: () => string[]
}

interface RestoreTreeOptions {
  onChanged: () => void
  onRename: (path: string) => void
}

interface Row {
  element: HTMLElement
  tick: HTMLElement
  rename: HTMLButtonElement
  path: string
}

function glyphFor(node: TrashEntryNode, expanded: boolean): string {
  return node.kind === 'folder' && expanded ? 'folder_open' : GLYPHS[node.kind]
}

function icon(glyph: string, className: string): HTMLElement {
  const element = document.createElement('span')
  element.className = className
  element.setAttribute('aria-hidden', 'true')
  element.textContent = glyph

  return element
}

function label(node: TrashEntryNode, depth: number): HTMLElement {
  const element = document.createElement('span')
  element.className = 'restore-tree__label'
  element.style.paddingInlineStart = `${String(depth * INDENT_EM)}em`
  element.append(icon(glyphFor(node, true), 'icon'), document.createTextNode(node.name))

  return element
}

function blockingReason(node: TrashEntryNode): string | null {
  if (node.blockedBy === null && node.restorable) return null

  return node.blockedBy === null ? 'name no longer allowed' : `${node.blockedBy} is back`
}

function blockedNote(reason: string): HTMLElement {
  const element = document.createElement('span')
  element.className = 'restore-tree__blocked'
  element.textContent = reason

  return element
}

function renameAction(node: TrashEntryNode): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'restore-tree__rename'
  element.tabIndex = PASSED_OVER
  element.setAttribute('aria-label', `Put ${node.name} back somewhere else`)
  element.title = 'Put back somewhere else'
  element.append(icon('drive_file_rename_outline', 'icon'))

  return element
}

function rowFor(node: TrashEntryNode, depth: number): Row {
  const element = document.createElement('div')
  element.className = ROW_CLASS
  element.setAttribute('role', 'treeitem')
  element.tabIndex = PASSED_OVER
  const { path, kind } = node
  element.dataset.path = path
  element.dataset.kind = kind
  if (kind === 'folder') element.setAttribute('aria-expanded', 'true')

  const tick = icon(TICKS.off.glyph, 'icon restore-tree__tick')
  const rename = renameAction(node)
  element.append(tick, label(node, depth))

  const reason = blockingReason(node)
  element.setAttribute('aria-label', reason === null ? node.name : `${node.name}, ${reason}`)
  if (reason !== null) element.append(blockedNote(reason))
  element.append(rename)

  return { element, tick, rename, path }
}

function itemFor(node: TrashEntryNode, depth: number, into: Row[]): HTMLElement {
  const row = rowFor(node, depth)
  into.push(row)

  const item = document.createElement('li')
  item.setAttribute('role', 'none')
  item.append(row.element)

  if (node.children.length > ROOT_DEPTH) item.append(groupFor(node.children, depth + ONE_LEVEL_DEEPER, into))

  return item
}

function groupFor(nodes: readonly TrashEntryNode[], depth: number, into: Row[]): HTMLElement {
  const group = document.createElement('ul')
  group.className = 'restore-tree__group'
  group.setAttribute('role', 'group')
  group.append(...nodes.map((node) => itemFor(node, depth, into)))

  return group
}

function paint(rows: readonly Row[], selection: RestoreSelection): void {
  for (const { element, tick, path } of rows) {
    const shown: Tick = TICKS[selection.stateOf(path)]
    element.setAttribute('aria-checked', shown.checked)
    tick.replaceChildren(shown.glyph)
  }
}

function markReachable(rows: readonly Row[], index: number): void {
  for (const [at, row] of rows.entries()) row.element.tabIndex = at === index ? REACHABLE : PASSED_OVER
}

function focusRow(rows: readonly Row[], index: number): void {
  markReachable(rows, index)
  rows[index]?.element.focus()
}

const TOGGLE_KEYS = new Set([KEYS.tickRow, KEYS.openRow])
const STEPS = new Map([
  [KEYS.nextRow, ONE_ROW],
  [KEYS.previousRow, -ONE_ROW],
])

export function renderRestoreTree(into: HTMLElement, entry: TrashEntryNode, options: RestoreTreeOptions): RestoreTree {
  const selection = createRestoreSelection(entry)
  const rows: Row[] = []

  const tree = document.createElement('ul')
  tree.className = 'restore-tree'
  tree.setAttribute('role', 'tree')
  tree.setAttribute('aria-multiselectable', 'true')
  tree.setAttribute('aria-label', 'What was deleted')
  tree.append(itemFor(entry, ROOT_DEPTH, rows))

  function toggle(row: Row): void {
    selection.toggle(row.path)
    paint(rows, selection)
    options.onChanged()
  }

  function step(from: number, by: number): void {
    const to = from + by
    if (to >= FIRST_ROW && to < rows.length) focusRow(rows, to)
  }

  function onKey(event: KeyboardEvent, row: Row, at: number): void {
    const by = STEPS.get(event.key)
    if (by !== undefined) step(at, by)
    else if (TOGGLE_KEYS.has(event.key)) toggle(row)
    else if (event.key === KEYS.rowAction) row.rename.focus()
    else return

    event.preventDefault()
  }

  for (const [at, row] of rows.entries()) {
    row.element.addEventListener('click', () => {
      toggle(row)
    })
    row.element.addEventListener('keydown', (event: KeyboardEvent) => {
      onKey(event, row, at)
    })
    row.rename.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation()
      options.onRename(row.path)
    })
    row.rename.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== KEYS.leaveRowAction) return

      row.element.focus()
      event.preventDefault()
    })
  }

  selection.toggle(entry.path)
  paint(rows, selection)
  markReachable(rows, FIRST_ROW)
  into.replaceChildren(tree)

  return { roots: () => selection.roots() }
}

export const TestOnly = { RESTORE_ROW_SELECTOR }
