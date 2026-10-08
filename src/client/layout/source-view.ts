'use sanity'

import { markdownLanguage } from '@codemirror/lang-markdown'

import { highlightCode } from '../highlight-code.ts'

const BODY_SELECTOR = '[data-part="source-body"]'

interface SourceView {
  show: (content: string) => void
}

const INERT: SourceView = { show: () => undefined }

export function createSourceView(host: ParentNode): SourceView {
  const body = host.querySelector<HTMLElement>(BODY_SELECTOR)
  if (body === null) return INERT

  return {
    show: (content: string) => {
      body.replaceChildren(highlightCode(content, markdownLanguage))
    },
  }
}
