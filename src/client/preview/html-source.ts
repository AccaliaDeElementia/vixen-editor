'use sanity'

import { renderMarkdown } from './render-markdown.ts'

const INDENT = '  '
const OWN_ATTRIBUTE = 'data-'
const POSITION_ATTRIBUTE = 'data-from'
const TOP_LEVEL = 1
const ONE_LEVEL = 1
const CODE_SELECTOR = 'pre > code'
const INLINE_ELEMENTS = new Set(['a', 'br', 'code', 'del', 'em', 'img', 'input', 'span', 'strong'])

function isInline(element: Element): boolean {
  return INLINE_ELEMENTS.has(element.tagName.toLowerCase())
}

function dropOwnAttributes(within: ParentNode): void {
  for (const element of within.querySelectorAll('*')) {
    for (const { name } of [...element.attributes]) if (name.startsWith(OWN_ATTRIBUTE)) element.removeAttribute(name)
  }
}

function flattenCode(within: ParentNode): void {
  for (const code of within.querySelectorAll(CODE_SELECTOR)) code.replaceChildren(code.textContent)
}

function layOut(element: Element, depth: number): void {
  const children = [...element.children]
  if (children.every(isInline)) return

  for (const child of children) {
    element.insertBefore(document.createTextNode(`\n${INDENT.repeat(depth)}`), child)
    layOut(child, depth + ONE_LEVEL)
  }
  element.append(document.createTextNode(`\n${INDENT.repeat(depth - ONE_LEVEL)}`))
}

export interface SourceBlock {
  from: number
  html: string
}

export function htmlSourceBlocks(markdown: string): readonly SourceBlock[] {
  const host = document.createElement('div')
  host.append(renderMarkdown(markdown))

  const blocks = [...host.children].map((element) => ({
    element,
    from: Number(element.getAttribute(POSITION_ATTRIBUTE)),
  }))

  dropOwnAttributes(host)
  flattenCode(host)
  for (const { element } of blocks) layOut(element, TOP_LEVEL)

  return blocks.map(({ element, from }) => ({ from, html: element.outerHTML }))
}
