'use sanity'

import { SEQUENCE_START } from '../../shared/sequences.ts'
import { encodeDestination } from '../../shared/link-syntax.ts'

import { destinationsIn, parseMarkdown } from './tree.ts'

export function rewriteLinkDestinations(markdown: string, rewrite: (destination: string) => string): string {
  let result = markdown

  for (const destination of destinationsIn(parseMarkdown(markdown), markdown).reverse()) {
    const replacement = rewrite(destination.value)
    if (replacement === destination.value) continue

    const encoded = encodeDestination(replacement, destination.bracketed)
    result = result.slice(SEQUENCE_START, destination.from) + encoded + result.slice(destination.to)
  }

  return result
}
