'use sanity'

import { tabIdentity, type TabAt } from '../layout/open-tabs.ts'
import type { DocumentTab } from './document-tab.ts'
import type { PaneWorkspace } from './pane-workspace.ts'
import { isPreviewView } from '../doc-path.ts'

interface AcrossPanesOptions {
  primary: PaneWorkspace
  aside: () => PaneWorkspace | null
  track: (work: Promise<void>) => void
}

interface AcrossPanes {
  open: () => readonly PaneWorkspace[]
  showingTheDocument: (entryPath: string) => PaneWorkspace
  contentOf: (entryPath: string) => string | null
  caretInto: (entryPath: string, offset: number) => void
  showWhereItIs: (at: TabAt) => boolean
}

export function createAcrossPanes(options: AcrossPanesOptions): AcrossPanes {
  function open(): readonly PaneWorkspace[] {
    const elsewhere = options.aside()

    return elsewhere === null ? [options.primary] : [options.primary, elsewhere]
  }

  function editorHolding(entryPath: string): DocumentTab | null {
    const holder = open().find((surface) => surface.held.path() === entryPath)
    if (holder === undefined) return null

    const showing = holder.editor()

    return showing.holding() === entryPath ? showing : null
  }

  function holdsATabFor(surface: PaneWorkspace, entryPath: string): boolean {
    return surface.pane.held().some((at) => at.path === entryPath && !isPreviewView(at.view))
  }

  return {
    open,

    showingTheDocument: (entryPath: string) =>
      open().find((surface) => holdsATabFor(surface, entryPath)) ?? options.primary,

    contentOf: (entryPath: string) => editorHolding(entryPath)?.view.state.doc.toString() ?? null,

    caretInto: (entryPath: string, offset: number) => {
      editorHolding(entryPath)?.putCaretAt(offset)
    },

    showWhereItIs: (at: TabAt) => {
      const wanted = tabIdentity(at)
      const holder = open().find((surface) =>
        surface.pane.held().some((candidate) => tabIdentity(candidate) === wanted),
      )
      if (holder === undefined) return false

      holder.pane.open(at)
      options.track(holder.showTab(at))

      return true
    },
  }
}
