'use sanity'

import { displayPathFromPath, docUrlFor, pathAfterMove, viewFromSearch, type TabView } from '../doc-path.ts'
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
import { openSplit, secondPaneIn } from '../layout/split.ts'
import { carryTab } from '../layout/pane.ts'
import { bindTabKeys } from './tab-keys.ts'
import { createClosingTabs } from './closing-tabs.ts'
import { createPaneMoves } from './pane-moves.ts'
import { createTabNavigation } from './tab-navigation.ts'

import type { EditorView } from '@codemirror/view'

import { startsALine } from './document-tab.ts'
import { createPaneWorkspace, MissingMountError, type PaneWorkspace } from './pane-workspace.ts'
import { createSession, type Session } from './session.ts'
import { guardUnload } from './unload.ts'
import { linkTo } from './drops.ts'
import { onInsertRequested } from '../insert-entry.ts'
import { onKeepRequested } from '../keep-request.ts'
import { onOpenAsideRequested } from '../open-aside.ts'
import { createDialogs, type Dialogs } from '../files/dialogs.ts'
import { bindHistoryButtons, refreshHistoryButtons } from './history-buttons.ts'

const PANE_SELECTOR = '[data-part="pane"]'
const PANES_SELECTOR = '[data-part="panes"]'
const BESIDE = 'beside'
const NOTHING_MEASURED = 0
const EVERYTHING_PENDING = 0

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
  session: Session
  navigate: (url: string) => void
  files: FilesClient
  reopen: () => void
  openUrl: (url: string) => void
  replaceUrl: (url: string) => void
}

function wiringFor(options: BootstrapOptions): Wiring {
  return {
    root: options.root ?? document,
    pathname: options.pathname ?? window.location.pathname,
    search: options.search ?? window.location.search,
    session: options.session ?? createSession(createDocumentClient()),
    navigate: options.navigate ?? replaceAddress,
    files: options.files ?? createFilesClient(),
    reopen: options.reopen ?? reloadPage,
    openUrl: options.openUrl ?? openPage,
    replaceUrl: options.replaceUrl ?? replacePage,
  }
}

async function bootstrap(options: BootstrapOptions = {}): Promise<Editor> {
  const { root, pathname, search, session, navigate, files, reopen, openUrl, replaceUrl } = wiringFor(options)
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

  const primaryWorkspace = createPaneWorkspace({
    root,
    element: pane,
    id: 'primary',
    pathname,
    session,
    files,
    dialogs,
    toast,
    previews,
    openUrl,
    reopen,
    announce: setStatus,
    listenForFocus: options.listenForFocus,
    onActivate: (at: TabAt) => {
      touched = primaryWorkspace
      activate(pane, at)
    },
    onCloseRequested: (at: TabAt) => {
      closingTabs.requestClose(primary, at)
    },
    onTabArrived: (identity: string, toIndex: number) => {
      carryTab(identity, primary, secondary?.pane ?? null, toIndex)
    },
    onShowing: (entryPath: string) => {
      openDocument.commit(entryPath)
    },
    releaseElsewhere: (at: TabAt) => {
      releaseFrom(secondary, at)
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
    const aside = touched === primaryWorkspace ? secondaryWorkspaceTowards(BESIDE) : primaryWorkspace
    if (aside === null) return

    touched = aside
    carrying.push(aside.showDocument(entryPath))
  })

  const { offDocumentMoved } = onDocumentMoved(root, ({ from, to, rewritten }) => {
    caretsFollowMove({ from, to })
    primary.followMove({ from, to })
    secondary?.pane.followMove({ from, to })
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

  let secondary: PaneWorkspace | null = null

  function secondaryWorkspace(): PaneWorkspace | null {
    const element = secondPaneIn(root)
    if (element === null) return null
    if (secondary?.element !== element) {
      teardownSecondaryDocument()
      const built: PaneWorkspace = createPaneWorkspace({
        root,
        element,
        id: 'secondary',
        pathname,
        session,
        files,
        dialogs,
        toast,
        previews,
        openUrl,
        reopen,
        announce: setStatus,
        onActivate: (at: TabAt) => {
          touched = built
          activate(element, at)
        },
        onCloseRequested: (at: TabAt) => {
          closingTabs.requestClose(built.pane, at)
        },
        onTabArrived: (identity: string, toIndex: number) => {
          carryTab(identity, built.pane, primary, toIndex)
        },
        onShowing: (entryPath: string) => {
          openDocument.commit(entryPath)
        },
        releaseElsewhere: (at: TabAt) => {
          releaseFrom(primaryWorkspace, at)
        },
      })

      secondary = built
    }

    return secondary
  }

  const closingTabs = createClosingTabs({
    primary,
    inFront: () => touched.pane,
    emptyTheEditor: () => {
      tab.empty()
    },
    saveState: tab.saveState,
    settleBeforeLeaving: tab.settleBeforeLeaving,
    showEmpty: () => {
      workspace.show('empty', displayPathFromPath(documentId()))
    },
  })

  function activate(host: HTMLElement, at: TabAt): void {
    if (at.view === 'editor' || at.path !== documentId()) {
      replaceUrl(docUrlFor(at.path, at.view))

      return
    }

    previews.render(host, at, view.state.doc.toString())
  }

  function secondaryWorkspaceTowards(towards: 'beside' | 'below'): PaneWorkspace | null {
    const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)
    openSplit(root, towards, panes === null ? NOTHING_MEASURED : panes.getBoundingClientRect().width)

    return secondaryWorkspace()
  }

  const previewing = createPreviewing({
    root,
    previews,
    primary,
    summon: () => secondaryWorkspaceTowards(BESIDE),
    focus: (surface: PaneWorkspace) => {
      touched = surface
    },
    releaseElsewhere: (at: TabAt) => {
      releaseFrom(primaryWorkspace, at)
    },
    documentId,
    contentNow: () => view.state.doc.toString(),
    showingDocument: () => touched.workspace.showing() === 'document',
    setStatus,
    navigate: (url: string) => {
      navigator.replaceQuietly(url)
    },
  })

  const carrying: Array<Promise<void>> = []

  function releaseFrom(surface: PaneWorkspace | null, at: TabAt): void {
    if (surface === null) return
    if (!surface.pane.held().some((candidate) => tabIdentity(candidate) === tabIdentity(at))) return

    surface.pane.close(at)
    if (at.view === 'editor') surface.leave()
  }

  const paneMoves = createPaneMoves({
    root,
    onCarried: (at: TabAt, arriving: PaneWorkspace, leaving: PaneWorkspace) => {
      if (at.view !== 'editor') return

      leaving.leave()
      carrying.push(arriving.showDocument(at.path))
    },
    primary: primaryWorkspace,
    summon: secondaryWorkspaceTowards,
    inFront: () => touched,
    goTo: (surface: PaneWorkspace) => {
      touched = surface
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

  await openPath(pathname, viewFromSearch(search))
  refreshHistoryButtons(root, navigator)

  function teardownSecondaryDocument(): void {
    secondary?.teardownDocument()
  }

  function teardownDocument(): void {
    offDocumentMoved()
    stopFollowingDeletion()
    offInsertRequested()
    offKeepRequested()
    offOpenAsideRequested()
    previews.stop()
    toast.dismissRaised()
    tab.teardownDocument()
    teardownSecondaryDocument()
  }

  const changes = connectToChanges({
    open: options.openChanges,
    onChange: (change) => {
      if (changeTouches(change, documentId())) void tab.recheck()
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
      await Promise.all(carrying.splice(EVERYTHING_PENDING))
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
