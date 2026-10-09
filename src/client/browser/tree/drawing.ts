'use sanity'

import { NOT_FOUND, SEQUENCE_START } from '../../../shared/sequences.ts'

import { decorativeIcon, ENTRY_GLYPHS, makeReachable, treeItem, treeRow } from './tree-rows.ts'

import type { EntryKind } from '../../../shared/documents.ts'

export const ROW_SELECTOR = '[role="treeitem"]'
export const ROOT_DEPTH = 0

export interface VisibleRow {
  path: string
  expandable: boolean
  kind: RowKind
  opens: string | null
}

type RowKind = EntryKind | 'trash-entry'

interface StoreRow extends VisibleRow {
  kind: EntryKind
}

export function isStoreRow(row: VisibleRow | undefined): row is StoreRow {
  return row !== undefined && row.kind !== 'trash-entry'
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
  kind: EntryKind
  draggable?: boolean
  name: string
  depth: number
  expanded: boolean | null
  selected: boolean
  href?: string
}

const DRAWN = new WeakMap<Element, Map<string, HTMLElement>>()

export function drawnIn(tree: Element): Map<string, HTMLElement> {
  const existing = DRAWN.get(tree)
  if (existing !== undefined) return existing

  const started = new Map<string, HTMLElement>()
  DRAWN.set(tree, started)

  return started
}

function rowIdentity(path: string, kind: EntryKind): string {
  return `${kind}:${path}`
}

export function row(options: RowOptions, drawn: Map<string, HTMLElement>): HTMLElement {
  const { path, kind, draggable, name, depth, expanded, selected, href } = options
  const identity = rowIdentity(path, kind)
  const element = drawn.get(identity) ?? treeRow({ path, kind, depth }, href)
  drawn.set(identity, element)

  element.className = 'tree__row'
  element.title = name
  element.style.setProperty('--depth', String(depth))
  element.setAttribute('aria-selected', String(selected))
  if (draggable === true) element.draggable = true

  if (expanded === null) element.removeAttribute('aria-expanded')
  else element.setAttribute('aria-expanded', String(expanded))

  element.replaceChildren(twisty(expanded), icon(ENTRY_GLYPHS[kind], kind), label(name))

  return element
}

export function itemFor(shown: HTMLElement): HTMLElement {
  const { parentElement: held } = shown

  return held !== null && held.tagName === 'LI' ? held : treeItem(shown)
}

export function syncChildren(parent: Element, wanted: readonly Element[]): void {
  const { children } = parent
  const keeping = new Set<Element>(wanted)
  for (const child of [...children]) if (!keeping.has(child)) child.remove()

  for (const [at, node] of wanted.entries()) {
    const { [at]: inPlace } = children
    if (inPlace !== node) parent.insertBefore(node, inPlace ?? null)
  }
}

export function applyRovingTabindex(tree: Element): void {
  const rows = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  const selected = rows.findIndex((candidate) => candidate.getAttribute('aria-selected') === 'true')

  makeReachable(rows, selected === NOT_FOUND ? SEQUENCE_START : selected)
}

export function rowIndexOf(tree: Element, target: EventTarget | null): number | null {
  const element = target instanceof Element ? target.closest<HTMLElement>(ROW_SELECTOR) : null
  if (element === null) return null

  const index = [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)].indexOf(element)

  return index === NOT_FOUND ? null : index
}
