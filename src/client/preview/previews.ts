'use sanity'

import { createMarkupView } from './markup-view.ts'
import { createSourceView } from './source-view.ts'
import type { PreviewBody } from './preview-body.ts'
import type { TabAt } from '../workspace/tabs/open-tabs.ts'
import type { PreviewView } from '../platform/doc-path.ts'

const PREVIEW_SETTLES_MS = 200
const NOTHING_SHOWING = 0

export const PREVIEW_ANNOUNCEMENTS: Readonly<Record<PreviewView, string>> = {
  source: 'Showing the HTML of',
  markup: 'Showing a preview of',
}

interface Showing {
  host: HTMLElement
  at: TabAt
  body: PreviewBody
}

export interface Previews {
  render: (host: HTMLElement, at: TabAt, content: string) => void
  refreshWith: (holder: string | null, content: string) => void
  revealOffset: (holder: string | null, offset: number) => void
  stop: () => void
}

export function createPreviews(putCaretAt: (entryPath: string, offset: number) => void): Previews {
  const rendered = new Map<HTMLElement, Showing>()
  let settling: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    if (settling !== null) clearTimeout(settling)
    settling = null
  }

  function forgetPanesThatLeft(): void {
    for (const host of rendered.keys()) if (!host.isConnected) rendered.delete(host)
  }

  function previewsOf(holder: string | null): Showing[] {
    forgetPanesThatLeft()

    return [...rendered.values()].filter((showing) => showing.at.path === holder)
  }

  return {
    render(host: HTMLElement, at: TabAt, content: string): void {
      forgetPanesThatLeft()

      const intoTheDocument = (offset: number): void => {
        putCaretAt(at.path, offset)
      }
      const body = at.view === 'source' ? createSourceView(host) : createMarkupView(host, intoTheDocument, at.path)
      body.show(content)
      rendered.set(host, { host, at, body })
    },

    refreshWith(holder: string | null, content: string): void {
      const targets = previewsOf(holder)
      if (targets.length === NOTHING_SHOWING) return

      stop()
      settling = setTimeout(() => {
        settling = null
        for (const target of targets) this.render(target.host, target.at, content)
      }, PREVIEW_SETTLES_MS)
    },

    revealOffset(holder: string | null, offset: number): void {
      for (const showing of previewsOf(holder)) showing.body.revealOffset(offset)
    },

    stop,
  }
}

export const TestOnly = { PREVIEW_SETTLES_MS }
