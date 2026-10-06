'use sanity'

import { renderMarkdown } from '../render-markdown.ts'
import { revealOnly } from './reveal-view.ts'

const SECTION_PART = 'view-markup'
const BODY_SELECTOR = '[data-part="markup-body"]'
const POSITIONED_SELECTOR = '[data-from]'

export interface MarkupView {
  show: (content: string) => void
  revealOffset: (offset: number) => void
}

const INERT: MarkupView = { show: () => undefined, revealOffset: () => undefined }

function answerClicksIn(body: HTMLElement, onBlockChosen: (offset: number) => void): void {
  for (const block of body.querySelectorAll<HTMLElement>(POSITIONED_SELECTOR)) {
    const from = Number(block.dataset.from)

    block.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation()
      onBlockChosen(from)
    })
  }
}

function blockAt(body: HTMLElement, offset: number): HTMLElement | null {
  let reached: HTMLElement | null = null

  for (const block of body.querySelectorAll<HTMLElement>(POSITIONED_SELECTOR)) {
    if (Number(block.dataset.from) <= offset) reached = block
  }

  return reached
}

export function createMarkupView(host: ParentNode, onBlockChosen: (offset: number) => void): MarkupView {
  const body = host.querySelector<HTMLElement>(BODY_SELECTOR)
  if (body === null) return INERT

  return {
    show: (content: string) => {
      body.replaceChildren(renderMarkdown(content))
      answerClicksIn(body, onBlockChosen)
      revealOnly(host, SECTION_PART)
    },

    revealOffset: (offset: number) => {
      blockAt(body, offset)?.scrollIntoView({ block: 'nearest' })
    },
  }
}
