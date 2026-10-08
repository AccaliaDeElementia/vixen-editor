'use sanity'

import { htmlLanguage } from '@codemirror/lang-html'

import { highlightCode } from '../highlight-code.ts'
import { htmlSourceBlocks, type SourceBlock } from '../html-source.ts'
import { blockAt, type PreviewBody } from './preview-body.ts'

const BODY_SELECTOR = '[data-part="source-body"]'
const BETWEEN_BLOCKS = '\n'
const FIRST = 0

const INERT: PreviewBody = { show: () => undefined, revealOffset: () => undefined }

function asBlock({ from, html }: SourceBlock): HTMLElement {
  const span = document.createElement('span')
  span.dataset.from = String(from)
  span.append(highlightCode(html, htmlLanguage))

  return span
}

export function createSourceView(host: ParentNode): PreviewBody {
  const body = host.querySelector<HTMLElement>(BODY_SELECTOR)
  if (body === null) return INERT

  return {
    show: (content: string) => {
      const blocks = htmlSourceBlocks(content)
      body.replaceChildren(
        ...blocks.flatMap((block, at) => (at === FIRST ? [asBlock(block)] : [BETWEEN_BLOCKS, asBlock(block)])),
      )
    },

    revealOffset: (offset: number) => {
      blockAt(body, offset)?.scrollIntoView({ block: 'nearest' })
    },
  }
}
