'use sanity'

import type { SanitiseHtml } from './sanitise-html.ts'

const CLOSING_TAG = '</'
const CARRY_NO_CONTENT = new Set(['br', 'col', 'hr', 'img', 'input', 'wbr'])

export function closesATag(source: string): boolean {
  return source.startsWith(CLOSING_TAG)
}

export function openedBy(source: string, sanitise: SanitiseHtml): HTMLElement | null {
  const { firstElementChild } = sanitise(source)

  return firstElementChild instanceof HTMLElement ? firstElementChild : null
}

export function holdsNothing(element: HTMLElement): boolean {
  return CARRY_NO_CONTENT.has(element.localName)
}
