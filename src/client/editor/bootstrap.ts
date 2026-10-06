'use sanity'

import {
  displayPathFromPath,
  docUrlFor,
  documentIdFromPath,
  folderIndexAlternateFromPath,
  pathAfterMove,
} from '../doc-path.ts'
import { classifyFile } from '../../shared/documents.ts'
import { onDocumentMoved } from '../document-moved.ts'
import { connectToChanges } from '../store-events.ts'
import { changeTouches } from '../../shared/store-change.ts'
import { interceptNavigation, openDocumentIn } from '../navigation.ts'
import { errorMessage } from '../error-message.ts'

import { directoryOf } from '../../shared/link-paths.ts'
import { EMPTY } from '../../shared/sequences.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'
import { cheatsheet } from '../help.ts'

import { caretsFollowMove } from './carets.ts'
import { createDocumentClient } from './document-client.ts'
import { followDeletion } from './follow-deletion.ts'
import { trashEntryIdFromPath } from '../../shared/page-urls.ts'
import { createToast } from '../toast.ts'
import { createFilesClient, type FilesClient } from '../files/files-client.ts'
import { createDeletedView } from '../layout/deleted-view.ts'
import { createImageView } from '../layout/image-view.ts'
import { createMissingView } from '../layout/missing-view.ts'
import { createStatusBar } from '../layout/status-bar.ts'
import type { TabAt } from '../layout/open-tabs.ts'
import { createMarkupView } from '../layout/markup-view.ts'
import { createSourceView } from '../layout/source-view.ts'
import { revealOnly } from '../layout/reveal-view.ts'
import { openSplit, secondPaneIn } from '../layout/split.ts'
import { createPane, type Pane } from '../layout/pane.ts'
import { createWorkspace } from '../layout/workspace.ts'

import type { EditorView } from '@codemirror/view'

import { createDocumentTab, startsALine } from './document-tab.ts'
import { createSession, type Session } from './session.ts'
import { resolveIndex } from './folder-index.ts'
import { guardUnload } from './unload.ts'
import { linkTo } from './drops.ts'
import { onInsertRequested } from '../insert-entry.ts'
import { KEYS } from '../help.ts'
import { onKeepRequested } from '../keep-request.ts'
import { createDialogs, type Dialogs } from '../files/dialogs.ts'
import { bindHistoryButtons, refreshHistoryButtons } from './history-buttons.ts'

const PANE_SELECTOR = '[data-part="pane"]'
const PANES_SELECTOR = '[data-part="panes"]'
const PREVIEW_SOURCE_SELECTOR = '#preview-source'
const PREVIEW_MARKUP_SELECTOR = '#preview-markup'
const BESIDE = 'beside'
const NOTHING_MEASURED = 0
const MOUNT_SELECTOR = '[data-part="editor"]'
const UNREACHABLE_REASON_SELECTOR = '[data-part="unreachable-reason"]'

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
  session?: Session
  navigate?: (url: string) => void
  listenForUnload?: (handler: (event: BeforeUnloadEvent) => void) => () => void
  files?: FilesClient
  reopen?: () => void
  openChanges?: (url: string) => EventSource
  openUrl?: (url: string) => void
  navigation?: Navigation
  dialogs?: Dialogs
  listenForFocus?: (wake: () => void, settled: () => Promise<void>) => () => void
}

function paneIn(root: ParentNode): HTMLElement {
  const pane = root.querySelector<HTMLElement>(PANE_SELECTOR)
  if (pane === null) throw new MissingMountError(PANE_SELECTOR)

  return pane
}

function reportUnreachable(host: ParentNode, at: string, error: unknown): void {
  const subject = at === '' ? 'The store' : at
  const element = host.querySelector(UNREACHABLE_REASON_SELECTOR)

  if (element !== null) element.textContent = `${subject} could not be loaded: ${errorMessage(error)}`
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

interface Wiring {
  root: ParentNode
  pathname: string
  session: Session
  navigate: (url: string) => void
  files: FilesClient
  reopen: () => void
  openUrl: (url: string) => void
}

function wiringFor(options: BootstrapOptions): Wiring {
  return {
    root: options.root ?? document,
    pathname: options.pathname ?? window.location.pathname,
    session: options.session ?? createSession(createDocumentClient()),
    navigate: options.navigate ?? replaceAddress,
    files: options.files ?? createFilesClient(),
    reopen: options.reopen ?? reloadPage,
    openUrl: options.openUrl ?? openPage,
  }
}

class MissingMountError extends Error {
  override readonly name = 'MissingMountError'

  constructor(selector: string) {
    super(`Missing editor mount point: ${selector}`)
  }
}

async function bootstrap(options: BootstrapOptions = {}): Promise<Editor> {
  const { root, pathname, session, navigate, files, reopen, openUrl } = wiringFor(options)
  const openDocument = openDocumentIn(root, pathname)

  const toast = createToast(root)
  const setStatus = (text: string): void => {
    toast.show(text)
  }

  const pane = paneIn(root)

  const mount = pane.querySelector(MOUNT_SELECTOR)
  if (mount === null) throw new MissingMountError(MOUNT_SELECTOR)

  const documentId = (): string => openDocument.path()
  const statusBar = createStatusBar(pane)
  const editorTab = (at: string): TabAt => ({ path: at, view: 'editor' })

  const primary = createPane(pane, 'primary', {
    onActivate: (at: TabAt) => {
      touched = primary
      activate(pane, at)
    },
    onCloseRequested: (at: TabAt) => {
      requestClose(primary, at)
    },
  })

  let touched: Pane = primary
  const workspace = createWorkspace(pane, {
    focusDocument: () => {
      view.focus()
    },
  })

  const dialogs = options.dialogs ?? createDialogs(root)

  const tab = createDocumentTab({
    mount,
    session,
    files,
    dialogs,
    toast,
    statusBar,
    documentId,
    openUrl,
    announce: setStatus,
    onEdited: () => {
      primary.keepWhenOpened(editorTab(documentId()))
    },
    showingDocument: () => workspace.showing() === 'document',
    listenForFocus: options.listenForFocus,
  })
  const { view } = tab

  const deletedView = createDeletedView({
    root,
    host: pane,
    client: files,
    dialogs,
    toast,
    openUrl,
    reveal: (at) => {
      workspace.show('deleted', at)
    },
  })

  const missingView = createMissingView({ host: pane, client: files, toast, reopen })

  function showMissing(entryPath: string, shown: string): void {
    tab.empty()
    primary.leave()
    workspace.show('missing', shown)
    missingView.offer(entryPath)
    setStatus(`${shown} is not in the store`)
  }

  const imageView = createImageView({
    host: pane,
    reveal: (at) => {
      workspace.show('image', at)
    },
    onBroken: (entryPath) => {
      showMissing(entryPath, entryPath)
    },
  })

  async function withCheatsheetIfNew(template: string, entryPath: string): Promise<string> {
    if (directoryOf(entryPath) !== STORE_ROOT) return template

    const tree = await files.tree().catch(() => null)
    if (tree === null || tree.length > EMPTY) return template

    return `${template}\n${cheatsheet()}`
  }

  async function showDocument(entryPath: string, shown: string, alternate: string | null): Promise<void> {
    const outcome = await resolveIndex(session, entryPath, alternate)
    if (!outcome.reached) {
      tab.empty()
      primary.leave()
      workspace.show('unreachable', shown)
      reportUnreachable(pane, shown, outcome.error)

      return
    }

    const { entryPath: opened, loaded } = outcome
    const { content: template, stored } = loaded
    if (!stored && alternate === null) {
      showMissing(opened, shown)

      return
    }

    openDocument.commit(opened)

    const initial = stored ? template : await withCheatsheetIfNew(template, opened)

    tab.open(opened, initial)
    primary.open(editorTab(opened))
    workspace.show('document', shown)
    setStatus(`Editing ${opened} — press Ctrl/Cmd+S to save`)
  }

  async function openPath(target: string): Promise<void> {
    const shown = displayPathFromPath(target)
    workspace.show('pending', shown)
    statusBar.forgetSaveState()

    const trashEntryId = trashEntryIdFromPath(target)
    if (trashEntryId !== null) {
      tab.empty()
      primary.leave()
      deletedView.offer(trashEntryId)
      setStatus('This entry is in the trash')

      return
    }

    openDocument.commit(documentIdFromPath(target))
    if (classifyFile(documentId()) === 'image') {
      tab.empty()
      primary.leave()
      imageView.offer(documentId())
      setStatus(`Viewing ${documentId()}`)

      return
    }

    await showDocument(documentId(), shown, folderIndexAlternateFromPath(target))
  }

  const { offDocumentMoved } = onDocumentMoved(root, ({ from, to, rewritten }) => {
    caretsFollowMove({ from, to })
    primary.followMove({ from, to })
    const moved = pathAfterMove({ from, to }, documentId())

    if (moved !== documentId()) {
      session.rename(documentId(), moved)
      openDocument.commit(moved)
      tab.followMove(moved)
      navigate(docUrlFor(moved))
      statusBar.forgetSaveState()
      setStatus(`Now editing ${moved}`)
    }

    if (rewritten.includes(documentId())) {
      toast.error(`${documentId()} changed on disk — reload to see the repaired links`)
    }
  })

  let secondary: Pane | null = null

  function secondaryPane(): Pane | null {
    const element = secondPaneIn(root)
    if (element === null) return null
    if (secondary?.element !== element) {
      const built: Pane = createPane(element, 'secondary', {
        onActivate: (at: TabAt) => {
          touched = built
          activate(element, at)
        },
        onCloseRequested: (at: TabAt) => {
          requestClose(built, at)
        },
      })

      secondary = built
    }

    return secondary
  }

  function showNothingIn(target: Pane): void {
    if (!target.isEmpty()) return
    if (target === primary) workspace.show('empty', displayPathFromPath(documentId()))
    else revealOnly(target.element, 'view-empty')
  }

  const closing: Array<Promise<void>> = []

  function closeEditorTab(target: Pane, at: TabAt): void {
    target.close(at)
    tab.empty()
    showNothingIn(target)
  }

  function requestClose(target: Pane, at: TabAt): void {
    if (at.view !== 'editor') {
      target.close(at)
      showNothingIn(target)

      return
    }

    if (tab.saveState() === 'clean') {
      closeEditorTab(target, at)

      return
    }

    closing.push(
      tab.settleBeforeLeaving().then((mayLeave) => {
        if (mayLeave) closeEditorTab(target, at)
      }),
    )
  }

  function closeTheTabInFront(): void {
    const at = touched.showing()
    if (at !== null) requestClose(touched, at)
  }

  function renderPreview(host: ParentNode, at: TabAt, content: string): void {
    if (at.view === 'source') createSourceView(host).show(content)
    else createMarkupView(host).show(content)
  }

  function activate(host: HTMLElement, at: TabAt): void {
    if (at.view === 'editor' || at.path !== documentId()) {
      openUrl(docUrlFor(at.path))

      return
    }

    renderPreview(host, at, view.state.doc.toString())
  }

  function showPreview(wanted: 'source' | 'markup', says: string): void {
    const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)
    openSplit(root, BESIDE, panes === null ? NOTHING_MEASURED : panes.getBoundingClientRect().width)

    const target = secondaryPane()
    if (target === null) return

    touched = target

    const at: TabAt = { path: documentId(), view: wanted }
    renderPreview(target.element, at, view.state.doc.toString())
    if (primary.holdsPermanently(editorTab(at.path))) target.keep(at)
    else target.open(at)

    setStatus(`${says} ${documentId()}`)
  }

  function showSourcePreview(): void {
    showPreview('source', 'Showing the source of')
  }

  function showMarkupPreview(): void {
    showPreview('markup', 'Showing a preview of')
  }

  root.querySelector<HTMLElement>(PREVIEW_SOURCE_SELECTOR)?.addEventListener('click', showSourcePreview)
  root.querySelector<HTMLElement>(PREVIEW_MARKUP_SELECTOR)?.addEventListener('click', showMarkupPreview)

  const onPreviewKey = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || !event.altKey) return

    if (event.key === KEYS.closeTab) {
      event.preventDefault()
      closeTheTabInFront()

      return
    }

    const wanted = event.shiftKey ? KEYS.previewSource : KEYS.previewMarkup
    if (event.key !== wanted) return

    event.preventDefault()
    if (event.shiftKey) showSourcePreview()
    else showMarkupPreview()
  }

  root.addEventListener('keydown', onPreviewKey)

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
    open: openPath,
    mayLeave: () => tab.saveState() === 'clean',
    settle: tab.settleBeforeLeaving,
    onSettled: () => {
      refreshHistoryButtons(root, navigator)
    },
  })
  bindHistoryButtons(root, navigator)

  await openPath(pathname)
  refreshHistoryButtons(root, navigator)

  function teardownDocument(): void {
    offDocumentMoved()
    stopFollowingDeletion()
    offInsertRequested()
    offKeepRequested()
    toast.dismissRaised()
    tab.teardownDocument()
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
    root.removeEventListener('keydown', onPreviewKey)
    unguardUnload()
    navigator.stopIntercepting()
    changes.disconnect()
  }

  return {
    view,
    teardownDocument,
    teardownApplication,
    settled: async () => {
      await Promise.all(closing.splice(NOTHING_MEASURED))
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

export const TestOnly = { MissingMountError, bootstrap, openPage, reloadPage, startsALine }
