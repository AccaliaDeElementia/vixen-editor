'use sanity'

import { parser } from '@lezer/markdown'

import { SEQUENCE_START } from '../../shared/sequences.ts'
import { encodeDestination } from '../../shared/link-syntax.ts'
import { destinationsIn, VIXEN_MARKDOWN_EXTENSIONS } from '../../shared/markdown-tree.ts'

const markdownParser = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

export function rewriteLinkDestinations(markdown: string, rewrite: (destination: string) => string): string {
  let result = markdown

  for (const destination of destinationsIn(markdownParser.parse(markdown), markdown).reverse()) {
    const replacement = rewrite(destination.value)
    if (replacement === destination.value) continue

    const encoded = encodeDestination(replacement, destination.bracketed)
    result = result.slice(SEQUENCE_START, destination.from) + encoded + result.slice(destination.to)
  }

  return result
}
