'use sanity'

import { docUrlFor, isPreviewView, type PreviewView, type TabView } from '../doc-path.ts'
import type { TabAt } from '../layout/open-tabs.ts'
import type { PaneWorkspace } from './pane-workspace.ts'

const PREVIEW_SOURCE_SELECTOR = '#preview-source'
const PREVIEW_MARKUP_SELECTOR = '#preview-markup'

interface PreviewingOptions {
  root: ParentNode
  holdsPermanently: (at: TabAt) => boolean
  summon: () => PaneWorkspace | null
  showWhereItIs: (at: TabAt) => boolean
  releaseElsewhere: (at: TabAt) => void
  documentId: () => string
  showingDocument: () => boolean
  show: (surface: PaneWorkspace, at: TabAt) => void
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

    const at: TabAt = { path: options.documentId(), view: wanted }
    options.releaseElsewhere(at)
    if (options.holdsPermanently({ path: at.path, view: 'editor' })) target.pane.keep(at)
    else target.pane.open(at)

    options.show(target, at)
    options.navigate(docUrlFor(at.path, wanted))
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
      if (!isPreviewView(wanted) || !options.showingDocument()) return
      if (options.showWhereItIs({ path: options.documentId(), view: wanted })) return

      show(wanted)
    },
  }
}
