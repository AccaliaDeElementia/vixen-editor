'use sanity'

import { renderMarkdown } from '../render-markdown.ts'
import { revealOnly } from './reveal-view.ts'

const SECTION_PART = 'view-markup'
const BODY_SELECTOR = '[data-part="markup-body"]'

interface MarkupView {
  show: (content: string) => void
}

const INERT: MarkupView = { show: () => undefined }

export function createMarkupView(host: ParentNode): MarkupView {
  const body = host.querySelector<HTMLElement>(BODY_SELECTOR)
  if (body === null) return INERT

  return {
    show: (content: string) => {
      body.replaceChildren(renderMarkdown(content))
      revealOnly(host, SECTION_PART)
    },
  }
}
