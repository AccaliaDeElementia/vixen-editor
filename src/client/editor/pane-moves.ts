'use sanity'

import { carryTab, type Pane } from '../layout/pane.ts'
import { tabIdentity } from '../layout/open-tabs.ts'
import type { SplitOrientation } from '../layout/split.ts'

const PANE_SELECTOR = '[data-part="pane"]'
const FIRST_TAB = 0

interface PaneMovesOptions {
  root: ParentNode
  primary: Pane
  summon: (towards: SplitOrientation) => Pane | null
  inFront: () => Pane
  goTo: (pane: Pane) => void
}

interface PaneMoves {
  toPane: (towards: SplitOrientation, forward: boolean, carrying: boolean) => void
}

export function createPaneMoves(options: PaneMovesOptions): PaneMoves {
  function markPaneInFront(): void {
    for (const candidate of options.root.querySelectorAll<HTMLElement>(PANE_SELECTOR)) {
      candidate.dataset.infront = String(candidate === options.inFront().element)
    }
  }

  return {
    toPane(towards: SplitOrientation, forward: boolean, carrying: boolean): void {
      const arriving = forward ? options.summon(towards) : options.primary
      if (arriving === null) return

      const leaving = options.inFront()
      const showing = leaving.showing()
      if (carrying && showing !== null) carryTab(tabIdentity(showing), arriving, leaving, FIRST_TAB)

      options.goTo(arriving)
      markPaneInFront()
    },
  }
}
