'use sanity'

import {
  docUrlFor,
  documentIdFromPath,
  isPreviewView,
  pathAfterMove,
  viewFromSearch,
  type TabView,
} from '../platform/doc-path.ts'
import { onDocumentMoved } from '../platform/announce/document-moved.ts'
import { connectToChanges } from '../platform/store-events.ts'
import { changeTouches } from '../../shared/store-change.ts'
import { interceptNavigation, openDocumentIn } from '../platform/navigation.ts'

import { caretsFollowMove } from '../document/carets.ts'
import { followDeletion } from '../document/follow-deletion.ts'
import { createToast } from '../platform/toast.ts'
import type { FilesClient } from '../browser/files-client.ts'
import type { TabAt } from '../workspace/tabs/open-tabs.ts'
import { createPreviews } from '../preview/previews.ts'
import { createPreviewing } from '../preview/previewing.ts'

import { STORE_ROOT } from '../../shared/store-path.ts'
import { bindTabKeys } from '../workspace/tabs/tab-keys.ts'
import { createPaneMoves } from '../workspace/panes/pane-moves.ts'
import { createAside } from '../workspace/panes/aside.ts'
import { createAcrossPanes } from '../workspace/panes/across-panes.ts'
import { createCaretMemory } from '../document/caret-memory.ts'
import { createTabNavigation } from '../workspace/tabs/tab-navigation.ts'
import { createSurfaces } from './surfaces.ts'

import type { EditorView } from '@codemirror/view'

import {
  createPaneWorkspace,
  MissingMountError,
  type PaneWorkspace,
  type PaneWorkspaceOptions,
} from '../workspace/panes/pane-workspace.ts'
import { createStaleBuild } from '../chrome/stale-build.ts'
import { watchBuild } from '../chrome/build-watch.ts'
import type { Session } from '../document/session.ts'
import { guardUnload } from '../document/unload.ts'
import { linkTo } from '../platform/entry-links.ts'
import { onInsertRequested } from '../platform/announce/insert-entry.ts'
import { onKeepRequested } from '../platform/announce/keep-request.ts'
import { onOpenAsideRequested } from '../platform/announce/open-aside.ts'
import { onSplitChanged, onSplitDismissRequested } from '../platform/announce/split-changed.ts'
import { onTrashEmptied } from '../platform/announce/trash-emptied.ts'
import { announceStoreChanged } from '../platform/announce/store-changed.ts'
import { createDialogs, type Dialogs } from '../platform/dialogs.ts'
import { bindHistoryButtons, refreshHistoryButtons } from '../chrome/history-buttons.ts'
import { paneIn, wiringFor } from './wiring.ts'

const BESIDE = 'beside'
const EVERYTHING_PENDING = 0

type PaneSettings = Pick<
  PaneWorkspaceOptions,
  | 'element'
  | 'id'
  | 'holds'
  | 'onActivate'
  | 'onCloseRequested'
  | 'onTabArrived'
  | 'releaseElsewhere'
  | 'listenForFocus'
>

interface Editor {
  view: EditorView
  teardownDocument: () => void
  teardownApplication: () => void
  settled: () => Promise<void>
  teardownEditor: () => void
}

interface BootstrapOptions {
  root?: ParentNode
  pathname?: string
  search?: string
  servedBuild?: string | null
  session?: Session
  navigate?: (url: string) => void
  listenForUnload?: (handler: (event: BeforeUnloadEvent) => void) => () => void
  files?: FilesClient
  reopen?: () => void
  openChanges?: (url: string) => EventSource
  openUrl?: (url: string) => void
  replaceUrl?: (url: string) => void
  navigation?: Navigation
  dialogs?: Dialogs
  listenForFocus?: (wake: () => void, settled: () => Promise<void>) => () => void
}

async function bootstrap(options: BootstrapOptions = {}): Promise<Editor> {
  const { root, pathname, search, servedBuild, session, navigate, files, reopen, openUrl, replaceUrl } =
    wiringFor(options)
  const openDocument = openDocumentIn(root, pathname)

  const toast = createToast(root)
  const caretMemory = createCaretMemory()
  const setStatus = (text: string): void => {
    toast.show(text)
  }

  const pane = paneIn(root)
  const dialogs = options.dialogs ?? createDialogs(root)

  const previews = createPreviews((entryPath: string, offset: number) => {
    panes.caretInto(entryPath, offset)
  })

  function paneWorkspaceWith(settings: PaneSettings): PaneWorkspace {
    return createPaneWorkspace({
      root,
      session,
      files,
      dialogs,
      toast,
      previews,
      previewControls: () => previewing,
      openUrl,
      reopen,
      announce: setStatus,
      onShowing: openDocument.commit,
      contentOf: (entryPath: string) => panes.contentOf(entryPath),
      caretMemory,
      ...settings,
    })
  }

  const primaryWorkspace = paneWorkspaceWith({
    element: pane,
    id: 'primary',
    holds: documentIdFromPath(pathname),
    listenForFocus: options.listenForFocus,
    onActivate: (at: TabAt) => {
      touched = primaryWorkspace
      activate(at)
    },
    onCloseRequested: (at: TabAt) => {
      surfaces.requestClose(primaryWorkspace, at)
    },
    onTabArrived: (identity: string, toIndex: number) => {
      const elsewhere = aside.current()
      if (elsewhere !== null) surfaces.tabArrived(identity, primaryWorkspace, elsewhere, toIndex)
    },
    releaseElsewhere: async (at: TabAt) => {
      await surfaces.releaseFrom(aside.current(), at)
    },
  })

  const { pane: primary, workspace, statusBar } = primaryWorkspace
  const tab = primaryWorkspace.editor()

  async function openPath(target: string, wanted: TabView): Promise<void> {
    await touched.openPath(target)
    previewing.showNamedByUrl(wanted)
  }
  const { view } = tab
  let touched: PaneWorkspace = primaryWorkspace
  const documentId = (): string => openDocument.path()

  const { offOpenAsideRequested } = onOpenAsideRequested(root, (entryPath: string) => {
    const elsewhere = touched === primaryWorkspace ? aside.summon(BESIDE) : primaryWorkspace
    if (elsewhere === null) return

    touched = elsewhere
    pending.push(elsewhere.showDocument(entryPath))
  })

  const { offDocumentMoved } = onDocumentMoved(root, ({ from, to, rewritten }) => {
    caretsFollowMove({ from, to })
    primary.followMove({ from, to })
    aside.current()?.pane.followMove({ from, to })
    const moved = pathAfterMove({ from, to }, documentId())

    if (moved !== documentId()) {
      session.rename(documentId(), moved)
      openDocument.commit(moved)
      primaryWorkspace.held.commit(moved)
      tab.followMove(moved)
      navigate(docUrlFor(moved))
      statusBar.forgetSaveState()
      setStatus(`Now editing ${moved}`)
    }

    if (rewritten.includes(documentId())) {
      toast.error(`${documentId()} changed on disk — reload to see the repaired links`)
    }
  })

  const aside = createAside({
    root,
    acrossThePanes: () => paneMoves.acrossThePanes(),
    build: (element: HTMLElement) => {
      const built: PaneWorkspace = paneWorkspaceWith({
        element,
        id: 'secondary',
        holds: null,
        onActivate: (at: TabAt) => {
          touched = built
          activate(at)
        },
        onCloseRequested: (at: TabAt) => {
          surfaces.requestClose(built, at)
        },
        onTabArrived: (identity: string, toIndex: number) => {
          surfaces.tabArrived(identity, built, primaryWorkspace, toIndex)
        },
        releaseElsewhere: async (at: TabAt) => {
          await surfaces.releaseFrom(primaryWorkspace, at)
        },
      })

      return built
    },
  })

  const panes = createAcrossPanes({
    primary: primaryWorkspace,
    aside: aside.current,
    track: (work: Promise<void>) => {
      pending.push(work)
    },
  })

  const surfaces = createSurfaces({
    primarySurface: primaryWorkspace,
    elsewhere: aside.current,
    open: () => panes.open(),
    inFront: () => touched,
    track: (work: Promise<void>) => {
      pending.push(work)
    },
    collapseOntoPrimary: (surface: PaneWorkspace) => {
      paneMoves.collapseOntoPrimary(surface)
    },
    dismissAside: () => {
      paneMoves.dismissAside()
    },
    showNothingAtAll: () => {
      navigator.replaceQuietly(docUrlFor(STORE_ROOT))
    },
  })

  function activate(at: TabAt): void {
    if (!isPreviewView(at.view)) {
      replaceUrl(docUrlFor(at.path, at.view))

      return
    }

    touched.pane.open(at)
    pending.push(touched.showTab(at))
  }

  const previewing = createPreviewing({
    holdsPermanently: (at: TabAt) => panes.showingTheDocument(at.path).pane.holdsPermanently(at),
    summon: () =>
      panes.showingTheDocument(documentId()) === primaryWorkspace ? aside.summon(BESIDE) : primaryWorkspace,
    showWhereItIs: panes.showWhereItIs,
    releaseElsewhere: (at: TabAt) => {
      pending.push(surfaces.releaseFrom(primaryWorkspace, at))
    },
    documentId,
    showingDocument: () => touched.workspace.showing() === 'document',
    show: (surface: PaneWorkspace, at: TabAt) => {
      pending.push(surface.showTab(at))
    },
    navigate: (url: string) => {
      navigator.replaceQuietly(url)
    },
  })

  const pending: Array<Promise<void>> = []

  const paneMoves = createPaneMoves({
    root,
    onCarried: surfaces.settleCarry,
    primary: primaryWorkspace,
    summon: aside.summon,
    inFront: () => touched,
    goTo: (surface: PaneWorkspace) => {
      touched = surface
    },
    forgetAside: aside.forget,
    aside: aside.current,
    settleOn: (at: TabAt, carryingFrom: PaneWorkspace | null) => {
      if (carryingFrom === null) {
        primary.open(at)

        return
      }

      surfaces.handOverTo(primaryWorkspace, at, carryingFrom)
    },
  })

  const navigation = createTabNavigation(() => touched.pane, activate)

  const unbindTabKeys = bindTabKeys(root, {
    cycle: navigation.cycle,
    move: navigation.move,
    jumpTo: navigation.jumpTo,
    toPane: paneMoves.toPane,
    close: surfaces.closeTheTabInFront,
    showSource: previewing.showSource,
    showMarkup: previewing.showMarkup,
  })

  const { offKeepRequested } = onKeepRequested(root, (entryPath) => {
    primary.keepWhenOpened({ path: entryPath, view: 'editor' })
  })

  const { stopFollowingDeletion } = followDeletion({
    root,
    documentId,
    autosave: { state: tab.saveState, flush: tab.flush },
    openUrl,
  })

  const { offInsertRequested } = onInsertRequested(root, (entryPath) => {
    if (workspace.showing() !== 'document') {
      toast.error(`Open a document before inserting ${entryPath}`)

      return
    }

    tab.insertAt(linkTo(entryPath, documentId()), tab.caret())
    setStatus(`Inserted a link to ${entryPath}`)
  })

  const { unguardUnload } = guardUnload({
    unsaved: () => tab.saveState() !== 'clean',
    rescue: tab.rescue,
    listen: options.listenForUnload,
  })

  const navigator = interceptNavigation({
    navigation: options.navigation ?? globalThis.navigation,
    open: async (at: string, atSearch: string) => {
      await openPath(at, viewFromSearch(atSearch))
    },
    mayLeave: () => tab.saveState() === 'clean',
    settle: tab.settleBeforeLeaving,
    onSettled: () => {
      refreshHistoryButtons(root, navigator)
    },
  })
  bindHistoryButtons(root, navigator)
  const dismissals = onSplitDismissRequested(root, paneMoves.closeTheAside)
  const splitChanges = onSplitChanged(root, () => {
    aside.reconcile()
  })

  const emptied = onTrashEmptied(root, surfaces.closeTrashTabs)

  const restored = aside.reconcile()
  if (restored?.pane.isEmpty() === true) paneMoves.dismissAside()

  touched = panes.showingTheDocument(documentIdFromPath(pathname))
  for (const surface of panes.open()) {
    if (surface === touched) continue
    if (surface.pane.isEmpty()) surface.workspace.show('empty', STORE_ROOT)
    else surfaces.settlePane(surface)
  }

  await openPath(pathname, viewFromSearch(search))
  refreshHistoryButtons(root, navigator)

  function teardownDocument(): void {
    offDocumentMoved()
    stopFollowingDeletion()
    offInsertRequested()
    offKeepRequested()
    offOpenAsideRequested()
    splitChanges.offSplitChanged()
    emptied.offTrashEmptied()
    dismissals.offSplitDismissRequested()
    previews.stop()
    toast.dismissRaised()
    tab.teardownDocument()
    aside.forget()
  }

  const staleBuild = createStaleBuild({
    root,
    dialogs,
    reload: reopen,
    announce: setStatus,
    saveEverything: panes.savedEverywhere,
  })

  const noticeBuild = watchBuild(servedBuild, () => {
    pending.push(staleBuild.noticed())
  })

  const changes = connectToChanges({
    open: options.openChanges,
    onBuild: noticeBuild,
    onChange: (change) => {
      if (changeTouches(change, documentId())) void tab.recheck()
      announceStoreChanged(root)
    },
    onConnected: () => {
      void tab.recheck()
    },
    onStale: () => {
      void tab.recheck()
      announceStoreChanged(root)
    },
  })

  function teardownApplication(): void {
    unbindTabKeys()
    unguardUnload()
    navigator.stopIntercepting()
    changes.disconnect()
  }

  return {
    view,
    teardownDocument,
    teardownApplication,
    settled: async () => {
      await Promise.all(pending.splice(EVERYTHING_PENDING))
      await surfaces.settled()
    },
    teardownEditor: () => {
      teardownDocument()
      teardownApplication()
    },
  }
}

export async function bootstrapOrReport(options: BootstrapOptions = {}): Promise<Editor | null> {
  return await bootstrap(options).catch(() => null)
}

export const TestOnly = { MissingMountError, bootstrap }
