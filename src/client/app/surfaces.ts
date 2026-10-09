'use sanity'

import { carryTab } from '../workspace/pane.ts'
import { createClosingTabs, type ClosingSurface } from '../workspace/closing-tabs.ts'
import { tabIdentity, type TabAt } from '../workspace/open-tabs.ts'
import type { PaneWorkspace } from '../workspace/pane-workspace.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'

interface Surfacing {
  primarySurface: PaneWorkspace
  elsewhere: () => PaneWorkspace | null
  open: () => readonly PaneWorkspace[]
  inFront: () => PaneWorkspace
  track: (work: Promise<void>) => void
  collapseOntoPrimary: (surface: PaneWorkspace) => void
  dismissAside: () => void
  showNothingAtAll: () => void
}

interface Surfaces {
  requestClose: (surface: PaneWorkspace, at: TabAt) => void
  settlePane: (surface: PaneWorkspace) => void
  releaseFrom: (surface: PaneWorkspace | null, at: TabAt) => Promise<void>
  handOverTo: (arriving: PaneWorkspace, at: TabAt, leaving: PaneWorkspace) => void
  settleCarry: (moved: TabAt | null, arriving: PaneWorkspace, leaving: PaneWorkspace) => void
  tabArrived: (identity: string, arriving: PaneWorkspace, leaving: PaneWorkspace, toIndex: number) => void
  closeTheTabInFront: () => void
  closeTrashTabs: () => void
  settled: () => Promise<void>
}

export function createSurfaces(options: Surfacing): Surfaces {
  const { primarySurface, elsewhere, open, inFront, track, collapseOntoPrimary, dismissAside } = options

  function closingSurfaceFor(surface: PaneWorkspace, reveal: () => void): ClosingSurface {
    return {
      pane: surface.pane,
      saveState: () => surface.editor().saveState(),
      settleBeforeLeaving: async () => await surface.editor().settleBeforeLeaving(),
      showNothing: () => {
        surface.release()
        reveal()
      },
      showActive: () => {
        const at = surface.pane.showing()
        if (at !== null) track(surface.showTab(at))
      },
    }
  }

  const closingPrimary = closingSurfaceFor(primarySurface, () => {
    const aside = elsewhere()
    if (aside !== null && !aside.pane.isEmpty()) {
      collapseOntoPrimary(aside)

      return
    }

    primarySurface.workspace.show('empty', STORE_ROOT)
  })

  function surfaceFor(surface: PaneWorkspace): ClosingSurface {
    return surface === primarySurface ? closingPrimary : closingSurfaceFor(surface, dismissAside)
  }

  const closingTabs = createClosingTabs({
    inFront: () => surfaceFor(inFront()),
    everySurface: () => open().map(surfaceFor),
    showNothingAtAll: options.showNothingAtAll,
  })

  function settlePane(surface: PaneWorkspace): void {
    closingTabs.settle(surfaceFor(surface))
  }

  async function releaseFrom(surface: PaneWorkspace | null, at: TabAt): Promise<void> {
    if (surface === null) return
    if (!surface.pane.held().some((candidate) => tabIdentity(candidate) === tabIdentity(at))) return

    if (at.view === 'editor') await surface.flush()

    surface.pane.close(at)
    settlePane(surface)
  }

  function handOverTo(arriving: PaneWorkspace, at: TabAt, leaving: PaneWorkspace): void {
    const handed = leaving.handOver()
    if (handed === null) track(arriving.showDocument(at.path))
    else arriving.adopt(at.path, handed)
  }

  async function carryDocument(at: TabAt, arriving: PaneWorkspace, leaving: PaneWorkspace): Promise<void> {
    await leaving.flush()
    handOverTo(arriving, at, leaving)
    settlePane(leaving)
  }

  function settleCarry(moved: TabAt | null, arriving: PaneWorkspace, leaving: PaneWorkspace): void {
    if (moved?.view === 'editor') {
      track(carryDocument(moved, arriving, leaving))

      return
    }

    settlePane(leaving)
    if (open().includes(arriving)) settlePane(arriving)
  }

  function tabArrived(identity: string, arriving: PaneWorkspace, leaving: PaneWorkspace, toIndex: number): void {
    settleCarry(carryTab(identity, arriving.pane, leaving.pane, toIndex), arriving, leaving)
  }

  return {
    requestClose: (surface: PaneWorkspace, at: TabAt) => {
      closingTabs.requestClose(surfaceFor(surface), at)
    },
    settlePane,
    releaseFrom,
    handOverTo,
    settleCarry,
    tabArrived,
    closeTheTabInFront: closingTabs.closeTheTabInFront,
    closeTrashTabs: closingTabs.closeTrashTabs,
    settled: closingTabs.settled,
  }
}
