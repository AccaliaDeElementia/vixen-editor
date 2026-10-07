'use sanity'

import { tabIdentity, type TabAt } from '../layout/open-tabs.ts'
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
  showWhereItIs: (at: TabAt) => boolean
}

export function createAcrossPanes(options: AcrossPanesOptions): AcrossPanes {
  function open(): readonly PaneWorkspace[] {
    const elsewhere = options.aside()

    return elsewhere === null ? [options.primary] : [options.primary, elsewhere]
  }

  function holdsATabFor(surface: PaneWorkspace, entryPath: string): boolean {
    return surface.pane.held().some((at) => at.path === entryPath && !isPreviewView(at.view))
  }

  return {
    open,

    showingTheDocument: (entryPath: string) =>
      open().find((surface) => holdsATabFor(surface, entryPath)) ?? options.primary,

    contentOf: (entryPath: string) => {
      const holder = open().find((surface) => surface.held.path() === entryPath)
      if (holder === undefined) return null

      const showing = holder.editor()

      return showing.holding() === entryPath ? showing.view.state.doc.toString() : null
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
