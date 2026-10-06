'use sanity'

import { docUrlFor, type PreviewView, type TabView } from '../doc-path.ts'
import type { TabAt } from '../layout/open-tabs.ts'
import type { Pane } from '../layout/pane.ts'
import { PREVIEW_ANNOUNCEMENTS, type Previews } from './previews.ts'

const PREVIEW_SOURCE_SELECTOR = '#preview-source'
const PREVIEW_MARKUP_SELECTOR = '#preview-markup'

interface PreviewingOptions {
  root: ParentNode
  previews: Previews
  primary: Pane
  summon: () => Pane | null
  focus: (pane: Pane) => void
  documentId: () => string
  contentNow: () => string
  showingDocument: () => boolean
  setStatus: (said: string) => void
  navigate: (url: string) => void
}

interface Previewing {
  showSource: () => void
  showMarkup: () => void
  showNamedByUrl: (wanted: TabView) => void
}

export function createPreviewing(options: PreviewingOptions): Previewing {
  function show(wanted: PreviewView): void {
    const target = options.summon()
    if (target === null) return

    options.focus(target)

    const at: TabAt = { path: options.documentId(), view: wanted }
    options.previews.render(target.element, at, options.contentNow())
    if (options.primary.holdsPermanently({ path: at.path, view: 'editor' })) target.keep(at)
    else target.open(at)

    const { [wanted]: says } = PREVIEW_ANNOUNCEMENTS
    options.navigate(docUrlFor(at.path, wanted))
    options.setStatus(`${says} ${at.path}`)
  }

  const showSource = (): void => {
    show('source')
  }
  const showMarkup = (): void => {
    show('markup')
  }

  options.root.querySelector<HTMLElement>(PREVIEW_SOURCE_SELECTOR)?.addEventListener('click', showSource)
  options.root.querySelector<HTMLElement>(PREVIEW_MARKUP_SELECTOR)?.addEventListener('click', showMarkup)

  return {
    showSource,
    showMarkup,

    showNamedByUrl: (wanted: TabView): void => {
      if (wanted === 'editor' || !options.showingDocument()) return

      show(wanted)
    },
  }
}
