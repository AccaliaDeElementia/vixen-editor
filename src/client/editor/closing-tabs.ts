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
  showActive: () => void
}

interface ClosingOptions {
  inFront: () => ClosingSurface
  everySurface: () => readonly ClosingSurface[]
  showNothingAtAll: () => void
}

interface ClosingTabs {
  requestClose: (surface: ClosingSurface, at: TabAt) => void
  settle: (surface: ClosingSurface) => void
  closeTheTabInFront: () => void
  settled: () => Promise<void>
}

export function createClosingTabs(options: ClosingOptions): ClosingTabs {
  const closing: Array<Promise<void>> = []

  function settle(surface: ClosingSurface): void {
    if (!surface.pane.isEmpty()) {
      surface.showActive()

      return
    }

    surface.showNothing()
    if (options.everySurface().every((candidate) => candidate.pane.isEmpty())) options.showNothingAtAll()
  }

  function closeEditorTab(surface: ClosingSurface, at: TabAt): void {
    const everywhere = [...options.everySurface()]
    surface.pane.close(at)

    for (const candidate of everywhere) {
      for (const view of PREVIEW_VIEWS) candidate.pane.close({ path: at.path, view })
    }

    for (const candidate of everywhere) settle(candidate)
  }

  function requestClose(surface: ClosingSurface, at: TabAt): void {
    if (at.view !== 'editor') {
      surface.pane.close(at)
      settle(surface)

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
    settle,

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
