'use sanity'

import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

import { headingsIn, type Heading } from '../../shared/markdown-tree.ts'

const LIST_SELECTOR = '[data-part="outline-list"]'
const EMPTY_SELECTOR = '[data-part="outline-empty"]'

const NOTHING_OPEN = 'Nothing is open.'
const NO_HEADINGS = 'This document has no headings.'

const TOP_LEVEL = 1
const NONE = 0

function rowFor({ level, text }: Heading): HTMLElement {
  const row = document.createElement('li')
  row.className = 'outline__row'
  row.style.setProperty('--depth', String(level - TOP_LEVEL))
  row.textContent = text

  return row
}

function headingsOf(state: EditorState): readonly Heading[] {
  return headingsIn(syntaxTree(state), state.doc.toString())
}

export function showOutline(into: ParentNode, state: EditorState | null): void {
  const list = into.querySelector<HTMLElement>(LIST_SELECTOR)
  const empty = into.querySelector<HTMLElement>(EMPTY_SELECTOR)
  if (list === null || empty === null) return

  const headings = state === null ? [] : headingsOf(state)

  list.replaceChildren(...headings.map(rowFor))
  empty.textContent = state === null ? NOTHING_OPEN : NO_HEADINGS
  empty.hidden = headings.length > NONE
}
