'use sanity'

import { htmlLanguage } from '@codemirror/lang-html'

import { highlightCode } from '../highlight-code.ts'
import { htmlSourceOf } from '../html-source.ts'

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
      body.replaceChildren(highlightCode(htmlSourceOf(content), htmlLanguage))
    },
  }
}
