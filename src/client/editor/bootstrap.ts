'use sanity'

import {
  docUrlFor,
  documentIdFromPath,
  isPreviewView,
  pathAfterMove,
  viewFromSearch,
  type TabView,
} from '../doc-path.ts'
import { onDocumentMoved } from '../document-moved.ts'
import { connectToChanges } from '../store-events.ts'
import { changeTouches } from '../../shared/store-change.ts'
import { interceptNavigation, openDocumentIn } from '../navigation.ts'

import { caretsFollowMove } from './carets.ts'
import { createDocumentClient } from './document-client.ts'
import { followDeletion } from './follow-deletion.ts'
import { createToast } from '../toast.ts'
import { createFilesClient, type FilesClient } from '../files/files-client.ts'
import { tabIdentity, type TabAt } from '../layout/open-tabs.ts'
import { createPreviews } from './previews.ts'
import { createPreviewing } from './previewing.ts'

import { STORE_ROOT } from '../../shared/store-path.ts'
import { carryTab } from '../layout/pane.ts'
import { bindTabKeys } from './tab-keys.ts'
import { createClosingTabs, type ClosingSurface } from './closing-tabs.ts'
import { createPaneMoves } from './pane-moves.ts'
import { createAside } from './aside.ts'
import { createTabNavigation } from './tab-navigation.ts'

import type { EditorView } from '@codemirror/view'

import { startsALine } from './document-tab.ts'
import {
  createPaneWorkspace,
  MissingMountError,
  type PaneWorkspace,
  type PaneWorkspaceOptions,
} from './pane-workspace.ts'
import { createStaleBuild } from './stale-build.ts'
import { buildThePageWasServed, watchBuild } from '../build-watch.ts'
import { createSession, type Session } from './session.ts'
import { guardUnload } from './unload.ts'
import { linkTo } from './drops.ts'
import { onInsertRequested } from '../insert-entry.ts'
import { onKeepRequested } from '../keep-request.ts'
import { onOpenAsideRequested } from '../open-aside.ts'
import { onSplitChanged } from '../split-changed.ts'
import { announceStoreChanged } from '../store-changed.ts'
import { createDialogs, type Dialogs } from '../files/dialogs.ts'
import { bindHistoryButtons, refreshHistoryButtons } from './history-buttons.ts'

const PANE_SELECTOR = '[data-part="pane"]'
const BESIDE = 'beside'
const EVERYTHING_PENDING = 0

type PaneSettings = Omit<
  PaneWorkspaceOptions,
  'root' | 'session' | 'files' | 'dialogs' | 'toast' | 'previews' | 'openUrl' | 'reopen' | 'announce' | 'onShowing'
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

function paneIn(root: ParentNode): HTMLElement {
  const pane = root.querySelector<HTMLElement>(PANE_SELECTOR)
  if (pane === null) throw new MissingMountError(PANE_SELECTOR)

  return pane
}

function replaceAddress(url: string): void {
  window.history.replaceState(null, '', url)
}

function reloadPage(): void {
  window.location.reload()
}

function openPage(url: string): void {
  window.location.assign(url)
}

function replacePage(url: string): void {
  window.location.replace(url)
}

interface Wiring {
  root: ParentNode
  pathname: string
  search: string
  servedBuild: string | null
  session: Session
  navigate: (url: string) => void
  files: FilesClient
  reopen: () => void
  openUrl: (url: string) => void
  replaceUrl: (url: string) => void
}

function pageAsServed(options: BootstrapOptions): Pick<Wiring, 'pathname' | 'search' | 'servedBuild'> {
  return {
    pathname: options.pathname ?? window.location.pathname,
    search: options.search ?? window.location.search,
    servedBuild: options.servedBuild ?? buildThePageWasServed(),
  }
}

function wiringFor(options: BootstrapOptions): Wiring {
  return {
    ...pageAsServed(options),
    root: options.root ?? document,
    session: options.session ?? createSession(createDocumentClient()),
    navigate: options.navigate ?? replaceAddress,
    files: options.files ?? createFilesClient(),
    reopen: options.reopen ?? reloadPage,
    openUrl: options.openUrl ?? openPage,
    replaceUrl: options.replaceUrl ?? replacePage,
  }
}

async function bootstrap(options: BootstrapOptions = {}): Promise<Editor> {
  const { root, pathname, search, servedBuild, session, navigate, files, reopen, openUrl, replaceUrl } =
    wiringFor(options)
  const openDocument = openDocumentIn(root, pathname)

  const toast = createToast(root)
  const setStatus = (text: string): void => {
    toast.show(text)
  }

  const pane = paneIn(root)
  const dialogs = options.dialogs ?? createDialogs(root)

  const previews = createPreviews((offset: number) => {
    tab.putCaretAt(offset)
  })

  function paneWorkspaceWith(settings: PaneSettings): PaneWorkspace {
    return createPaneWorkspace({
      root,
      session,
      files,
      dialogs,
      toast,
      previews,
      openUrl,
      reopen,
      announce: setStatus,
      onShowing: (entryPath: string) => {
        openDocument.commit(entryPath)
      },
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
      activate(pane, at)
    },
    onCloseRequested: (at: TabAt) => {
      closingTabs.requestClose(closingPrimary, at)
    },
    onTabArrived: (identity: string, toIndex: number) => {
      carryTab(identity, primary, aside.current()?.pane ?? null, toIndex)
      const elsewhere = aside.current()
      if (elsewhere !== null) tabLeft(elsewhere)
    },
    releaseElsewhere: async (at: TabAt) => {
      await releaseFrom(aside.current(), at)
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
  const editorTab = (at: string): TabAt => ({ path: at, view: 'editor' })

  function nowShowing(entryPath: string): void {
    openDocument.commit(entryPath)
    primaryWorkspace.held.commit(entryPath)
  }

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
      nowShowing(moved)
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
          activate(element, at)
        },
        onCloseRequested: (at: TabAt) => {
          closingTabs.requestClose(closingAside(built), at)
        },
        onTabArrived: (identity: string, toIndex: number) => {
          carryTab(identity, built.pane, primary, toIndex)
          tabLeft(primaryWorkspace)
        },
        releaseElsewhere: async (at: TabAt) => {
          await releaseFrom(primaryWorkspace, at)
        },
      })

      return built
    },
  })

  function closingSurfaceFor(surface: PaneWorkspace, reveal: () => void): ClosingSurface {
    return {
      pane: surface.pane,
      saveState: () => surface.editor().saveState(),
      settleBeforeLeaving: async () => await surface.editor().settleBeforeLeaving(),
      showNothing: () => {
        surface.release()
        reveal()
      },
    }
  }

  const closingPrimary = closingSurfaceFor(primaryWorkspace, () => {
    const elsewhere = aside.current()
    if (elsewhere !== null && !elsewhere.pane.isEmpty()) {
      paneMoves.collapseOntoPrimary(elsewhere)

      return
    }

    workspace.show('empty', STORE_ROOT)
  })

  function closingAside(surface: PaneWorkspace): ClosingSurface {
    return closingSurfaceFor(surface, () => {
      paneMoves.dismissAside()
    })
  }

  function everySurface(): readonly ClosingSurface[] {
    const elsewhere = aside.current()

    return elsewhere === null ? [closingPrimary] : [closingPrimary, closingAside(elsewhere)]
  }

  const closingTabs = createClosingTabs({
    inFront: () => (touched === primaryWorkspace ? closingPrimary : closingAside(touched)),
    everySurface,
    showNothingAtAll: () => {
      navigator.replaceQuietly(docUrlFor(STORE_ROOT))
    },
  })

  function tabLeft(vacated: PaneWorkspace): void {
    closingTabs.showNothingIn(vacated === primaryWorkspace ? closingPrimary : closingAside(vacated))
  }

  function activate(host: HTMLElement, at: TabAt): void {
    if (!isPreviewView(at.view) || at.path !== documentId()) {
      replaceUrl(docUrlFor(at.path, at.view))

      return
    }

    previews.render(host, at, view.state.doc.toString())
  }

  const previewing = createPreviewing({
    root,
    previews,
    primary,
    summon: () => aside.summon(BESIDE),
    focus: (surface: PaneWorkspace) => {
      touched = surface
    },
    releaseElsewhere: (at: TabAt) => {
      pending.push(releaseFrom(primaryWorkspace, at))
    },
    documentId,
    contentNow: () => view.state.doc.toString(),
    showingDocument: () => touched.workspace.showing() === 'document',
    setStatus,
    navigate: (url: string) => {
      navigator.replaceQuietly(url)
    },
  })

  const pending: Array<Promise<void>> = []

  async function releaseFrom(surface: PaneWorkspace | null, at: TabAt): Promise<void> {
    if (surface === null) return
    if (!surface.pane.held().some((candidate) => tabIdentity(candidate) === tabIdentity(at))) return

    surface.pane.close(at)
    if (at.view === 'editor') await surface.leave()
  }

  async function carried(at: TabAt, arriving: PaneWorkspace, leaving: PaneWorkspace): Promise<void> {
    await leaving.leave()
    await arriving.showDocument(at.path)
  }

  const paneMoves = createPaneMoves({
    root,
    onCarried: (at: TabAt, arriving: PaneWorkspace, leaving: PaneWorkspace) => {
      if (at.view !== 'editor') return

      pending.push(carried(at, arriving, leaving))
    },
    primary: primaryWorkspace,
    summon: aside.summon,
    inFront: () => touched,
    goTo: (surface: PaneWorkspace) => {
      touched = surface
    },
    forgetAside: aside.forget,
    show: (surface: PaneWorkspace, entryPath: string) => {
      pending.push(surface.showDocument(entryPath))
    },
  })

  const navigation = createTabNavigation(
    () => touched.pane,
    (host, at) => {
      activate(host, at)
    },
  )

  const unbindTabKeys = bindTabKeys(root, {
    cycle: navigation.cycle,
    move: navigation.move,
    jumpTo: navigation.jumpTo,
    toPane: paneMoves.toPane,
    close: closingTabs.closeTheTabInFront,
    showSource: previewing.showSource,
    showMarkup: previewing.showMarkup,
  })

  const { offKeepRequested } = onKeepRequested(root, (entryPath) => {
    primary.keepWhenOpened(editorTab(entryPath))
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
  const splitChanges = onSplitChanged(root, () => {
    aside.reconcile()
  })

  const restored = aside.reconcile()
  if (restored?.pane.isEmpty() === true) paneMoves.dismissAside()

  await openPath(pathname, viewFromSearch(search))
  refreshHistoryButtons(root, navigator)

  function teardownDocument(): void {
    offDocumentMoved()
    stopFollowingDeletion()
    offInsertRequested()
    offKeepRequested()
    offOpenAsideRequested()
    splitChanges.offSplitChanged()
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
    saveEverything: async () => {
      const everywhere = [primaryWorkspace.flush(), aside.current()?.flush() ?? Promise.resolve(true)]

      return (await Promise.all(everywhere)).every((saved) => saved)
    },
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
      await closingTabs.settled()
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

export const TestOnly = { MissingMountError, bootstrap, openPage, replacePage, reloadPage, startsALine }
