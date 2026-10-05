'use sanity'

import { markdownLanguage } from '@codemirror/lang-markdown'

import { highlightCode } from '../highlight-code.ts'

const SECTION_SELECTOR = '[data-part="view-source"]'
const BODY_SELECTOR = '[data-part="source-body"]'

interface SourceView {
  show: (content: string) => void
}

const INERT: SourceView = { show: () => undefined }

export function createSourceView(host: ParentNode): SourceView {
  const section = host.querySelector<HTMLElement>(SECTION_SELECTOR)
  const body = section?.querySelector<HTMLElement>(BODY_SELECTOR) ?? null
  if (section === null || body === null) return INERT

  return {
    show: (content: string) => {
      body.replaceChildren(highlightCode(content, markdownLanguage))
      section.hidden = false
    },
  }
}
