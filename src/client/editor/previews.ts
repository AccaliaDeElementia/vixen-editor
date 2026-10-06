'use sanity'

import { createMarkupView, type MarkupView } from '../layout/markup-view.ts'
import { createSourceView } from '../layout/source-view.ts'
import type { TabAt } from '../layout/open-tabs.ts'

interface Previews {
  render: (host: ParentNode, at: TabAt, content: string) => void
  revealOffset: (offset: number) => void
}

export function createPreviews(putCaretAt: (offset: number) => void): Previews {
  let showing: MarkupView | null = null

  return {
    render(host: ParentNode, at: TabAt, content: string): void {
      if (at.view === 'source') {
        showing = null
        createSourceView(host).show(content)

        return
      }

      const markup = createMarkupView(host, putCaretAt)
      markup.show(content)
      showing = markup
    },

    revealOffset(offset: number): void {
      showing?.revealOffset(offset)
    },
  }
}
