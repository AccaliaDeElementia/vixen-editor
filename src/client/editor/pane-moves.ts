'use sanity'

import { carryTab } from '../layout/pane.ts'
import type { PaneWorkspace } from './pane-workspace.ts'
import { tabIdentity, type TabAt } from '../layout/open-tabs.ts'
import type { SplitOrientation } from '../layout/split.ts'

const PANE_SELECTOR = '[data-part="pane"]'
const FIRST_TAB = 0

interface PaneMovesOptions {
  root: ParentNode
  primary: PaneWorkspace
  summon: (towards: SplitOrientation) => PaneWorkspace | null
  inFront: () => PaneWorkspace
  goTo: (surface: PaneWorkspace) => void
  onCarried: (at: TabAt, arriving: PaneWorkspace, leaving: PaneWorkspace) => void
}

interface PaneMoves {
  toPane: (towards: SplitOrientation, forward: boolean, carrying: boolean) => void
  markPaneInFront: () => void
}

export function createPaneMoves(options: PaneMovesOptions): PaneMoves {
  function markPaneInFront(): void {
    for (const candidate of options.root.querySelectorAll<HTMLElement>(PANE_SELECTOR)) {
      candidate.dataset.infront = String(candidate === options.inFront().element)
    }
  }

  return {
    markPaneInFront,

    toPane(towards: SplitOrientation, forward: boolean, carrying: boolean): void {
      const arriving = forward ? options.summon(towards) : options.primary
      if (arriving === null) return

      const leaving = options.inFront()
      const showing = leaving.pane.showing()
      if (carrying && showing !== null) {
        carryTab(tabIdentity(showing), arriving.pane, leaving.pane, FIRST_TAB)
        options.onCarried(showing, arriving, leaving)
      }

      options.goTo(arriving)
      markPaneInFront()
    },
  }
}
