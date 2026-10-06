'use sanity'

import { revealOnly } from '../layout/reveal-view.ts'
import type { Pane } from '../layout/pane.ts'
import type { TabAt } from '../layout/open-tabs.ts'

const EMPTY_PART = 'view-empty'
const OLDEST = 0

interface ClosingOptions {
  primary: Pane
  inFront: () => Pane
  emptyTheEditor: () => void
  saveState: () => string
  settleBeforeLeaving: () => Promise<boolean>
  showEmpty: () => void
}

interface ClosingTabs {
  requestClose: (target: Pane, at: TabAt) => void
  closeTheTabInFront: () => void
  settled: () => Promise<void>
}

export function createClosingTabs(options: ClosingOptions): ClosingTabs {
  const closing: Array<Promise<void>> = []

  function showNothingIn(target: Pane): void {
    if (!target.isEmpty()) return
    if (target === options.primary) options.showEmpty()
    else revealOnly(target.element, EMPTY_PART)
  }

  function closeEditorTab(target: Pane, at: TabAt): void {
    target.close(at)
    options.emptyTheEditor()
    showNothingIn(target)
  }

  function requestClose(target: Pane, at: TabAt): void {
    if (at.view !== 'editor') {
      target.close(at)
      showNothingIn(target)

      return
    }

    if (options.saveState() === 'clean') {
      closeEditorTab(target, at)

      return
    }

    closing.push(
      options.settleBeforeLeaving().then((mayLeave) => {
        if (mayLeave) closeEditorTab(target, at)
      }),
    )
  }

  return {
    requestClose,

    closeTheTabInFront(): void {
      const at = options.inFront().showing()
      if (at !== null) requestClose(options.inFront(), at)
    },

    settled: async () => {
      await Promise.all(closing.splice(OLDEST))
    },
  }
}
