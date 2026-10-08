'use sanity'

import { createMarkupView, type MarkupView } from '../layout/markup-view.ts'
import { createSourceView } from '../layout/source-view.ts'
import type { TabAt } from '../layout/open-tabs.ts'
import type { PreviewView } from '../doc-path.ts'

const PREVIEW_SETTLES_MS = 200

export const PREVIEW_ANNOUNCEMENTS: Readonly<Record<PreviewView, string>> = {
  source: 'Showing the HTML of',
  markup: 'Showing a preview of',
}

interface Showing {
  host: ParentNode
  at: TabAt
}

export interface Previews {
  render: (host: ParentNode, at: TabAt, content: string) => void
  refreshWith: (holder: string | null, content: string) => void
  revealOffset: (offset: number) => void
  stop: () => void
}

export function createPreviews(putCaretAt: (offset: number) => void): Previews {
  let showing: MarkupView | null = null
  let rendered: Showing | null = null
  let settling: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    if (settling !== null) clearTimeout(settling)
    settling = null
  }

  return {
    render(host: ParentNode, at: TabAt, content: string): void {
      rendered = { host, at }

      if (at.view === 'source') {
        showing = null
        createSourceView(host).show(content)

        return
      }

      const markup = createMarkupView(host, putCaretAt)
      markup.show(content)
      showing = markup
    },

    refreshWith(holder: string | null, content: string): void {
      const target = rendered
      if (target?.at.path !== holder) return

      stop()
      settling = setTimeout(() => {
        settling = null
        this.render(target.host, target.at, content)
      }, PREVIEW_SETTLES_MS)
    },

    revealOffset(offset: number): void {
      showing?.revealOffset(offset)
    },

    stop,
  }
}

export const TestOnly = { PREVIEW_SETTLES_MS }
