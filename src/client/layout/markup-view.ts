'use sanity'

import { renderMarkdown } from '../render-markdown.ts'
import { blockAt, positionedBlocksIn, type PreviewBody } from './preview-body.ts'

const BODY_SELECTOR = '[data-part="markup-body"]'

const INERT: PreviewBody = { show: () => undefined, revealOffset: () => undefined }

function answerClicksIn(body: HTMLElement, onBlockChosen: (offset: number) => void): void {
  for (const block of positionedBlocksIn(body)) {
    const from = Number(block.dataset.from)

    block.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation()
      onBlockChosen(from)
    })
  }
}

export function createMarkupView(host: ParentNode, onBlockChosen: (offset: number) => void): PreviewBody {
  const body = host.querySelector<HTMLElement>(BODY_SELECTOR)
  if (body === null) return INERT

  return {
    show: (content: string) => {
      body.replaceChildren(renderMarkdown(content))
      answerClicksIn(body, onBlockChosen)
    },

    revealOffset: (offset: number) => {
      blockAt(body, offset)?.scrollIntoView({ block: 'nearest' })
    },
  }
}
