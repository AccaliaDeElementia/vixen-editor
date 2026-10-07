'use sanity'

import { PREVIEW_VIEWS } from '../doc-path.ts'
import type { Pane } from '../layout/pane.ts'
import type { TabAt } from '../layout/open-tabs.ts'

const OLDEST = 0

export interface ClosingSurface {
  pane: Pane
  saveState: () => string
  settleBeforeLeaving: () => Promise<boolean>
  showNothing: () => void
}

interface ClosingOptions {
  inFront: () => ClosingSurface
  everySurface: () => readonly ClosingSurface[]
}

interface ClosingTabs {
  requestClose: (surface: ClosingSurface, at: TabAt) => void
  closeTheTabInFront: () => void
  settled: () => Promise<void>
}

export function createClosingTabs(options: ClosingOptions): ClosingTabs {
  const closing: Array<Promise<void>> = []

  function showNothingIn(surface: ClosingSurface): void {
    if (!surface.pane.isEmpty()) return

    surface.showNothing()
  }

  function closePreviewsOf(entryPath: string): void {
    for (const surface of options.everySurface()) {
      for (const view of PREVIEW_VIEWS) surface.pane.close({ path: entryPath, view })
      showNothingIn(surface)
    }
  }

  function closeEditorTab(surface: ClosingSurface, at: TabAt): void {
    surface.pane.close(at)
    closePreviewsOf(at.path)
    showNothingIn(surface)
  }

  function requestClose(surface: ClosingSurface, at: TabAt): void {
    if (at.view !== 'editor') {
      surface.pane.close(at)
      showNothingIn(surface)

      return
    }

    if (surface.saveState() === 'clean') {
      closeEditorTab(surface, at)

      return
    }

    closing.push(
      surface.settleBeforeLeaving().then((mayLeave) => {
        if (mayLeave) closeEditorTab(surface, at)
      }),
    )
  }

  return {
    requestClose,

    closeTheTabInFront(): void {
      const surface = options.inFront()
      const at = surface.pane.showing()
      if (at !== null) requestClose(surface, at)
    },

    settled: async () => {
      await Promise.all(closing.splice(OLDEST))
    },
  }
}
