'use sanity'

import { headingsOf, type Heading } from '../../shared/markdown-tree.ts'

const LIST_SELECTOR = '[data-part="outline-list"]'
const EMPTY_SELECTOR = '[data-part="outline-empty"]'

const NOTHING_OPEN = 'Nothing is open.'
const NO_HEADINGS = 'This document has no headings.'

const TOP_LEVEL = 1
const NONE = 0

function rowFor({ level, text, from }: Heading, chosen: (offset: number) => void): HTMLElement {
  const row = document.createElement('li')
  const jump = document.createElement('button')
  jump.type = 'button'
  jump.className = 'outline__row'
  jump.style.setProperty('--depth', String(level - TOP_LEVEL))
  jump.textContent = text
  jump.addEventListener('click', () => {
    chosen(from)
  })
  row.append(jump)

  return row
}

export function showOutline(into: ParentNode, markdown: string | null, chosen: (offset: number) => void): void {
  const list = into.querySelector<HTMLElement>(LIST_SELECTOR)
  const empty = into.querySelector<HTMLElement>(EMPTY_SELECTOR)
  if (list === null || empty === null) return

  const headings = markdown === null ? [] : headingsOf(markdown)

  list.replaceChildren(...headings.map((heading) => rowFor(heading, chosen)))
  empty.textContent = markdown === null ? NOTHING_OPEN : NO_HEADINGS
  empty.hidden = headings.length > NONE
}
