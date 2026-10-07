'use sanity'

import { openSplit, secondPaneIn, type SplitOrientation } from '../layout/split.ts'
import type { PaneWorkspace } from './pane-workspace.ts'

interface AsideOptions {
  root: ParentNode
  build: (element: HTMLElement) => PaneWorkspace
  acrossThePanes: () => number
}

interface Aside {
  current: () => PaneWorkspace | null
  reconcile: () => PaneWorkspace | null
  summon: (towards: SplitOrientation) => PaneWorkspace | null
  forget: () => void
}

export function createAside(options: AsideOptions): Aside {
  let held: PaneWorkspace | null = null

  function forget(): void {
    held?.teardownDocument()
    held = null
  }

  function reconcile(): PaneWorkspace | null {
    const element = secondPaneIn(options.root)
    if (element === null) {
      forget()

      return null
    }

    if (held?.element !== element) {
      forget()
      held = options.build(element)
    }

    return held
  }

  return {
    current: () => held,
    reconcile,
    forget,

    summon: (towards: SplitOrientation) => {
      openSplit(options.root, towards, options.acrossThePanes())

      return reconcile()
    },
  }
}
