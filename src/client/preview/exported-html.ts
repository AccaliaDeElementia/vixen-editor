'use sanity'

import { renderMarkdown, RAW_HTML_CLASS } from './render-markdown.ts'
import type { SanitiseHtml } from './sanitise-html.ts'

const PLUMBING = ['data-from', 'data-to', 'data-language']
const WRAPPED_BY_THE_PREVIEW = `code span[class], div.${RAW_HTML_CLASS}`

function unwrap(element: Element): void {
  element.replaceWith(...element.childNodes)
}

function strippedOf(markdown: string, sanitise?: SanitiseHtml): HTMLElement {
  const host = document.createElement('div')
  host.append(sanitise === undefined ? renderMarkdown(markdown) : renderMarkdown(markdown, sanitise))

  for (const element of host.querySelectorAll(WRAPPED_BY_THE_PREVIEW)) unwrap(element)
  for (const element of host.querySelectorAll('*')) {
    for (const attribute of PLUMBING) element.removeAttribute(attribute)
  }

  return host
}

export function exportedFragment(markdown: string, sanitise?: SanitiseHtml): DocumentFragment {
  const fragment = document.createDocumentFragment()
  fragment.append(...strippedOf(markdown, sanitise).childNodes)

  return fragment
}

function exportedHtml(markdown: string, sanitise?: SanitiseHtml): string {
  return strippedOf(markdown, sanitise).innerHTML
}

export const TestOnly = { exportedHtml }
