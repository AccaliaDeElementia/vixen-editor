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
import { createOpenTabs } from '../layout/open-tabs.ts'
import { createTabStrip } from '../layout/tab-strip.ts'
import { createWorkspace } from '../layout/workspace.ts'

import type { EditorView } from '@codemirror/view'

import { createDocumentTab, startsALine } from './document-tab.ts'
import { createSession, type Session } from './session.ts'
import { resolveIndex } from './folder-index.ts'
import { guardUnload } from './unload.ts'
import { linkTo } from './drops.ts'
import { onInsertRequested } from '../insert-entry.ts'
import { createDialogs, type Dialogs } from '../files/dialogs.ts'
import { bindHistoryButtons, refreshHistoryButtons } from './history-buttons.ts'

const MOUNT_SELECTOR = '#editor'
const TAB_STRIP_SELECTOR = '#tab-strip'
const UNREACHABLE_REASON_SELECTOR = '#unreachable-reason'

interface Editor {
  view: EditorView
  teardownDocument: () => void
  teardownApplication: () => void
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
  openUrl?: (url: string) => void
  navigation?: Navigation
  dialogs?: Dialogs
  freshnessMs?: number
  listenForFocus?: (wake: () => void, settled: () => Promise<void>) => () => void
}

function reportUnreachable(root: ParentNode, at: string, error: unknown): void {
  const subject = at === '' ? 'The store' : at
  const element = root.querySelector(UNREACHABLE_REASON_SELECTOR)

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

interface Strip {
  opened: (at: string) => void
  left: () => void
}

function stripIn(root: ParentNode, openUrl: (url: string) => void): Strip {
  const tabs = createOpenTabs()
  const host = root.querySelector<HTMLElement>(TAB_STRIP_SELECTOR)
  const strip =
    host === null
      ? null
      : createTabStrip(host, {
          onActivate: ({ path }) => {
            openUrl(docUrlFor(path))
          },
        })

  function draw(): void {
    strip?.show(tabs.all(), tabs.active())
  }

  return {
    opened: (at: string) => {
      tabs.open({ path: at, view: 'editor' })
      draw()
    },
    left: () => {
      tabs.leave()
      draw()
    },
  }
}

async function bootstrap(options: BootstrapOptions = {}): Promise<Editor> {
  const { root, pathname, session, navigate, files, reopen, openUrl } = wiringFor(options)
  const openDocument = openDocumentIn(root, pathname)

  const toast = createToast(root)
  const setStatus = (text: string): void => {
    toast.show(text)
  }

  const mount = root.querySelector(MOUNT_SELECTOR)
  if (mount === null) throw new MissingMountError(MOUNT_SELECTOR)

  const documentId = (): string => openDocument.path()
  const statusBar = createStatusBar(root)
  const strip = stripIn(root, openUrl)
  const workspace = createWorkspace(root, {
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
    showingDocument: () => workspace.showing() === 'document',
    freshnessMs: options.freshnessMs,
    listenForFocus: options.listenForFocus,
  })
  const { view } = tab

  const deletedView = createDeletedView({
    root,
    client: files,
    dialogs,
    toast,
    openUrl,
    reveal: (at) => {
      workspace.show('deleted', at)
    },
  })

  const missingView = createMissingView({ root, client: files, toast, reopen })

  function showMissing(entryPath: string, shown: string): void {
    tab.empty()
    strip.left()
    workspace.show('missing', shown)
    missingView.offer(entryPath)
    setStatus(`${shown} is not in the store`)
  }

  const imageView = createImageView({
    root,
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
      strip.left()
      workspace.show('unreachable', shown)
      reportUnreachable(root, shown, outcome.error)

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
    strip.opened(opened)
    workspace.show('document', shown)
    setStatus(`Editing ${opened} — press Ctrl/Cmd+S to save`)
  }

  async function openPath(target: string): Promise<void> {
    const shown = displayPathFromPath(target)
    workspace.show('pending', shown)
    statusBar.showPath(shown)

    const trashEntryId = trashEntryIdFromPath(target)
    if (trashEntryId !== null) {
      tab.empty()
      strip.left()
      deletedView.offer(trashEntryId)
      setStatus('This entry is in the trash')

      return
    }

    openDocument.commit(documentIdFromPath(target))
    if (classifyFile(documentId()) === 'image') {
      tab.empty()
      strip.left()
      imageView.offer(documentId())
      setStatus(`Viewing ${documentId()}`)

      return
    }

    await showDocument(documentId(), shown, folderIndexAlternateFromPath(target))
  }

  const { offDocumentMoved } = onDocumentMoved(root, ({ from, to, rewritten }) => {
    caretsFollowMove({ from, to })
    const moved = pathAfterMove({ from, to }, documentId())

    if (moved !== documentId()) {
      session.rename(documentId(), moved)
      openDocument.commit(moved)
      tab.followMove(moved)
      navigate(docUrlFor(moved))
      statusBar.showPath(moved)
      setStatus(`Now editing ${moved}`)
    }

    if (rewritten.includes(documentId())) {
      toast.error(`${documentId()} changed on disk — reload to see the repaired links`)
    }
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
    toast.dismissRaised()
    tab.teardownDocument()
  }

  function teardownApplication(): void {
    unguardUnload()
    navigator.stopIntercepting()
  }

  return {
    view,
    teardownDocument,
    teardownApplication,
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
