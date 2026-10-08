'use sanity'

import { createMarkupView } from '../layout/markup-view.ts'
import { createSourceView } from '../layout/source-view.ts'
import type { PreviewBody } from '../layout/preview-body.ts'
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
  body: PreviewBody
}

export interface Previews {
  render: (host: ParentNode, at: TabAt, content: string) => void
  refreshWith: (holder: string | null, content: string) => void
  revealOffset: (holder: string | null, offset: number) => void
  stop: () => void
}

export function createPreviews(putCaretAt: (entryPath: string, offset: number) => void): Previews {
  let rendered: Showing | null = null
  let settling: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    if (settling !== null) clearTimeout(settling)
    settling = null
  }

  return {
    render(host: ParentNode, at: TabAt, content: string): void {
      const intoTheDocument = (offset: number): void => {
        putCaretAt(at.path, offset)
      }
      const body = at.view === 'source' ? createSourceView(host) : createMarkupView(host, intoTheDocument)
      body.show(content)
      rendered = { host, at, body }
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

    revealOffset(holder: string | null, offset: number): void {
      if (rendered?.at.path !== holder) return

      rendered.body.revealOffset(offset)
    },

    stop,
  }
}

export const TestOnly = { PREVIEW_SETTLES_MS }
