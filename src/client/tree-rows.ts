'use sanity'

import type { EntryKind } from '../shared/documents.ts'

const REACHABLE = '0'
const PASSED_OVER = '-1'

export const ENTRY_GLYPHS: Readonly<Record<EntryKind, string>> = {
  folder: 'folder',
  document: 'description',
  image: 'image',
}

interface RowPlacement {
  path: string
  kind: string
  depth: number
}

export function decorativeIcon(glyph: string, className: string): HTMLElement {
  const element = document.createElement('span')
  element.className = className
  element.setAttribute('aria-hidden', 'true')
  element.textContent = glyph

  return element
}

export function treeGroup(className: string): HTMLElement {
  const element = document.createElement('ul')
  element.className = className
  element.setAttribute('role', 'group')

  return element
}

export function treeItem(row: HTMLElement): HTMLElement {
  const element = document.createElement('li')
  element.setAttribute('role', 'none')
  element.append(row)

  return element
}

function elementFor(href: string | undefined): HTMLElement {
  if (href === undefined) return document.createElement('div')

  const anchor = document.createElement('a')
  anchor.href = href

  return anchor
}

export function treeRow(placement: RowPlacement, href?: string): HTMLElement {
  const { path, kind, depth } = placement
  const element = elementFor(href)

  element.setAttribute('role', 'treeitem')
  element.setAttribute('tabindex', PASSED_OVER)
  element.style.setProperty('--depth', String(depth))
  element.dataset.path = path
  element.dataset.kind = kind

  return element
}

export function makeReachable(rows: readonly HTMLElement[], index: number): void {
  for (const [at, row] of rows.entries()) row.setAttribute('tabindex', at === index ? REACHABLE : PASSED_OVER)
}

export function focusRowAt(rows: readonly HTMLElement[], index: number): boolean {
  const { [index]: next } = rows
  if (next === undefined) return false

  makeReachable(rows, index)
  next.focus()

  return true
}
