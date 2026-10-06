'use sanity'

import type { Pane } from '../layout/pane.ts'
import { tabIdentity, type TabAt } from '../layout/open-tabs.ts'

const NOT_SHOWING = -1
const FIRST_POSITION = 0
const PAST_THE_FIRST = 1

interface TabNavigation {
  cycle: (by: number) => void
  move: (by: number) => void
  jumpTo: (position: number) => void
}

export function createTabNavigation(
  paneInFront: () => Pane,
  activate: (host: HTMLElement, at: TabAt) => void,
): TabNavigation {
  function positionOfShowing(pane: Pane): number {
    const current = pane.showing()

    return current === null
      ? NOT_SHOWING
      : pane.held().findIndex((candidate) => tabIdentity(candidate) === tabIdentity(current))
  }

  return {
    cycle(by: number): void {
      const pane = paneInFront()
      const held = pane.held()
      const next = held.at((positionOfShowing(pane) + by) % held.length)
      if (next === undefined) return

      activate(pane.element, next)
    },

    move(by: number): void {
      const pane = paneInFront()
      const current = pane.showing()
      if (current === null) return

      pane.reorder(current, Math.max(positionOfShowing(pane) + by, FIRST_POSITION))
    },

    jumpTo(position: number): void {
      const pane = paneInFront()
      const wanted = pane.held().at(position - PAST_THE_FIRST)
      if (wanted === undefined) return

      activate(pane.element, wanted)
    },
  }
}
