'use sanity'

import { carryTab } from '../layout/pane.ts'
import { forgetKeptTabs } from '../layout/kept-tabs.ts'
import type { PaneWorkspace } from './pane-workspace.ts'
import { tabIdentity, type TabAt } from '../layout/open-tabs.ts'
import { closeSplit, type SplitOrientation } from '../layout/split.ts'

const PANE_SELECTOR = '[data-part="pane"]'
const PANES_SELECTOR = '[data-part="panes"]'
const FIRST_TAB = 0
const ASIDE = 'secondary'
const NOTHING_MEASURED = 0

interface PaneMovesOptions {
  root: ParentNode
  primary: PaneWorkspace
  summon: (towards: SplitOrientation) => PaneWorkspace | null
  inFront: () => PaneWorkspace
  goTo: (surface: PaneWorkspace) => void
  onCarried: (at: TabAt, arriving: PaneWorkspace, leaving: PaneWorkspace) => void
  forgetAside: () => void
  aside: () => PaneWorkspace | null
  settleOn: (at: TabAt, carryingFrom: PaneWorkspace | null) => void
}

interface PaneMoves {
  toPane: (towards: SplitOrientation, forward: boolean, carrying: boolean) => void
  acrossThePanes: () => number
  dismissAside: () => void
  closeTheAside: () => void
  collapseOntoPrimary: (from: PaneWorkspace) => void
}

export function createPaneMoves(options: PaneMovesOptions): PaneMoves {
  function markPaneInFront(): void {
    for (const candidate of options.root.querySelectorAll<HTMLElement>(PANE_SELECTOR)) {
      candidate.dataset.infront = String(candidate === options.inFront().element)
    }
  }

  function acrossThePanes(): number {
    const panes = options.root.querySelector<HTMLElement>(PANES_SELECTOR)

    return panes === null ? NOTHING_MEASURED : panes.getBoundingClientRect().width
  }

  function dismissAside(): void {
    forgetKeptTabs(ASIDE)
    options.forgetAside()
    options.goTo(options.primary)
    closeSplit(options.root, acrossThePanes())
    markPaneInFront()
  }

  function heldBy(surface: PaneWorkspace, at: TabAt): boolean {
    const wanted = tabIdentity(at)

    return surface.pane.held().some((candidate) => tabIdentity(candidate) === wanted)
  }

  function collapseOntoPrimary(from: PaneWorkspace): void {
    const winner = options.inFront().pane.showing() ?? from.pane.showing()
    const carryingFrom = winner !== null && heldBy(from, winner) ? from : null

    for (const [index, at] of from.pane.held().entries()) options.primary.pane.receive(at, index)

    if (winner !== null) options.settleOn(winner, carryingFrom)
    dismissAside()
  }

  function closeTheAside(): void {
    const elsewhere = options.aside()
    if (elsewhere === null || elsewhere.pane.isEmpty()) {
      dismissAside()

      return
    }

    collapseOntoPrimary(elsewhere)
  }

  return {
    acrossThePanes,
    dismissAside,
    closeTheAside,
    collapseOntoPrimary,

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
