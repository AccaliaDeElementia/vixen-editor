'use sanity'

import { EMPTY } from '../../shared/sequences.ts'
import { classifyFile } from '../../shared/documents.ts'
import { directoryOf } from '../../shared/link-paths.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'
import { trashEntryIdFromPath } from '../../shared/page-urls.ts'
import {
  displayPathFromPath,
  docUrlFor,
  documentIdFromPath,
  folderIndexAlternateFromPath,
  isPreviewView,
  type PreviewView,
} from '../doc-path.ts'
import type { TabAt } from '../layout/open-tabs.ts'
import type { PaneId } from '../layout/kept-tabs.ts'
import { cheatsheet } from '../help.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { FilesClient } from '../files/files-client.ts'
import { createDeletedView } from '../layout/deleted-view.ts'
import { createImageView } from '../layout/image-view.ts'
import { createMissingView } from '../layout/missing-view.ts'
import { createPane, type Pane } from '../layout/pane.ts'
import { tabNamed } from '../layout/tab-strip.ts'
import { createStatusBar, type StatusBar } from '../layout/status-bar.ts'
import { createWorkspace, type Workspace } from '../layout/workspace.ts'
import type { Toast } from '../toast.ts'
import type { CarriedDocument, DocumentTab, FocusListener } from './document-tab.ts'
import { resolveIndex } from './folder-index.ts'
import { createPaneEditor } from './pane-editor.ts'
import { bindControlBar, type PreviewControls } from './control-bar.ts'
import type { CaretMemory } from './caret-memory.ts'
import { bindViewDrops } from './view-drops.ts'
import { uploadInto } from './drops.ts'
import { announceStoreChanged } from '../store-changed.ts'
import { PREVIEW_ANNOUNCEMENTS, type Previews } from './previews.ts'
import type { Session } from './session.ts'
import { errorMessage } from '../error-message.ts'

const MOUNT_SELECTOR = '[data-part="editor"]'
const UNREACHABLE_REASON_SELECTOR = '[data-part="unreachable-reason"]'
const NO_TRASHED_PATH = ''

export class MissingMountError extends Error {
  override readonly name = 'MissingMountError'

  constructor(selector: string) {
    super(`Missing editor mount point: ${selector}`)
  }
}

export interface PaneWorkspaceOptions {
  root: ParentNode
  element: HTMLElement
  id: PaneId
  holds: string | null
  session: Session
  files: FilesClient
  dialogs: Dialogs
  toast: Toast
  previews: Previews
  previewControls: () => PreviewControls
  openUrl: (url: string) => void
  reopen: () => void
  announce: (text: string) => void
  onActivate: (at: TabAt) => void
  onCloseRequested: (at: TabAt) => void
  onTabArrived: (identity: string, toIndex: number) => void
  onShowing: (entryPath: string) => void
  contentOf: (entryPath: string) => string | null
  caretMemory: CaretMemory
  releaseElsewhere: (at: TabAt) => Promise<void>
  listenForFocus?: FocusListener | undefined
}

interface HeldDocument {
  path: () => string | null
  commit: (entryPath: string) => void
}

export interface PaneWorkspace {
  element: HTMLElement
  statusBar: StatusBar
  pane: Pane
  held: HeldDocument
  editor: () => DocumentTab
  teardownDocument: () => void
  workspace: Workspace
  openPath: (target: string) => Promise<void>
  showTab: (at: TabAt) => Promise<void>
  handOver: () => CarriedDocument | null
  adopt: (entryPath: string, carried: CarriedDocument) => void
  release: () => void
  flush: () => Promise<boolean>
  showDocument: (entryPath: string) => Promise<void>
}

function reportUnreachable(host: ParentNode, at: string, error: unknown): void {
  const subject = at === '' ? 'The store' : at
  const element = host.querySelector(UNREACHABLE_REASON_SELECTOR)

  if (element !== null) element.textContent = `${subject} could not be loaded: ${errorMessage(error)}`
}

export function createPaneWorkspace(options: PaneWorkspaceOptions): PaneWorkspace {
  const { element, files, session, toast, previews, announce, dialogs } = options

  const found = element.querySelector(MOUNT_SELECTOR)
  if (found === null) throw new MissingMountError(MOUNT_SELECTOR)

  const mount: Element = found

  let holding: string | null = options.holds
  const held: HeldDocument = {
    path: () => holding,
    commit: (entryPath: string) => {
      holding = entryPath
    },
  }
  const statusBar = createStatusBar(element)
  const pane = createPane(element, options.id, {
    onActivate: options.onActivate,
    onCloseRequested: options.onCloseRequested,
    onTabArrived: options.onTabArrived,
    onDisplaced: (at: TabAt) => {
      announce(`Closed ${tabNamed(at)} — it was only being looked at`)
    },
  })

  let built: DocumentTab | null = null
  const workspace = createWorkspace(element, {
    focusDocument: () => {
      built?.view.focus()
    },
  })

  function editor(): DocumentTab {
    built ??= createPaneEditor({
      pane,
      mount,
      session,
      files,
      dialogs,
      toast,
      statusBar,
      previews,
      documentId: held.path,
      openUrl: options.openUrl,
      announce,
      onStored: tellTheBrowser,
      caretMemory: options.caretMemory,
      showingDocument: () => workspace.showing() === 'document',
      listenForFocus: options.listenForFocus,
    })

    return built
  }

  async function openEntry(entryPath: string): Promise<void> {
    await openPath(docUrlFor(entryPath))
  }

  async function storeAndOpen(dropped: readonly File[], directory: string): Promise<void> {
    const [landed] = await uploadInto(dropped, directory, {
      client: files,
      dialogs,
      toast,
      announce: tellTheBrowser,
    })
    if (landed === undefined) return

    await openEntry(landed)
  }

  bindControlBar(element, { editor, previewing: options.previewControls })

  bindViewDrops(element, {
    holder: () => pane.showing()?.path ?? null,
    open: (entryPath: string) => {
      void openEntry(entryPath)
    },
    upload: (dropped: readonly File[], directory: string) => {
      void storeAndOpen(dropped, directory)
    },
  })

  function release(): void {
    built?.empty()
    holding = null
  }

  function tellTheBrowser(): void {
    announceStoreChanged(options.root)
  }

  function showInstead(at: TabAt): void {
    built?.empty()
    pane.open(at)
  }

  const deletedView = createDeletedView({
    root: options.root,
    host: element,
    client: files,
    dialogs,
    toast,
    openUrl: options.openUrl,
    reveal: (at) => {
      workspace.show('deleted', at)
      if (at !== NO_TRASHED_PATH) showInstead({ path: at, view: 'deleted' })
    },
  })

  const missingView = createMissingView({ host: element, client: files, toast, reopen: options.reopen })

  function showMissing(entryPath: string, shown: string): void {
    showInstead({ path: entryPath, view: 'missing' })
    workspace.show('missing', shown)
    missingView.offer(entryPath)
    announce(`${shown} is not in the store`)
  }

  function showImage(entryPath: string): void {
    showInstead({ path: entryPath, view: 'image' })
    imageView.offer(entryPath)
    announce(`Viewing ${entryPath}`)
  }

  const imageView = createImageView({
    host: element,
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

  async function textOf(entryPath: string): Promise<string> {
    const held = options.contentOf(entryPath)
    if (held !== null) return held

    const loaded = await session.load(entryPath).catch(() => null)

    return loaded?.content ?? ''
  }

  async function showPreview(entryPath: string, view: PreviewView): Promise<void> {
    previews.render(element, { path: entryPath, view }, await textOf(entryPath))
    workspace.show(view, entryPath)
    announce(`${PREVIEW_ANNOUNCEMENTS[view]} ${entryPath}`)
  }

  async function showDocumentAt(entryPath: string, shown: string, alternate: string | null): Promise<void> {
    if (classifyFile(entryPath) === 'image') {
      await options.releaseElsewhere({ path: entryPath, view: 'image' })
      showImage(entryPath)

      return
    }

    const outcome = await resolveIndex(session, entryPath, alternate)
    if (!outcome.reached) {
      showInstead({ path: shown, view: 'unreachable' })
      workspace.show('unreachable', shown)
      reportUnreachable(element, shown, outcome.error)

      return
    }

    const { entryPath: reached, loaded } = outcome
    const { content: template, stored } = loaded
    if (!stored && alternate === null) {
      showMissing(reached, shown)

      return
    }

    options.onShowing(reached)
    held.commit(reached)

    const initial = stored ? template : await withCheatsheetIfNew(template, reached)

    const at: TabAt = { path: reached, view: 'editor' }
    await options.releaseElsewhere(at)
    editor().open(reached, initial)
    pane.open(at)
    workspace.show('document', shown)
    announce(`Editing ${reached} — press Ctrl/Cmd+S to save`)
  }

  return {
    element,
    statusBar,
    pane,
    held,
    editor,
    workspace,

    flush: async () => {
      if (built === null) return true

      await built.flush()

      return built.saveState() === 'clean'
    },

    teardownDocument: () => {
      built?.teardownDocument()
      built = null
    },

    showDocument: async (entryPath: string) => {
      await showDocumentAt(entryPath, entryPath, null)
    },

    showTab: async (at: TabAt) => {
      if (isPreviewView(at.view)) {
        await showPreview(at.path, at.view)

        return
      }

      await showDocumentAt(at.path, at.path, null)
    },

    release,

    handOver: () => {
      const carried = built?.handOver() ?? null
      holding = null

      return carried
    },

    adopt: (entryPath: string, carried: CarriedDocument) => {
      options.onShowing(entryPath)
      held.commit(entryPath)
      editor().adopt(entryPath, carried)
      pane.open({ path: entryPath, view: 'editor' })
      workspace.show('document', entryPath)
      announce(`Editing ${entryPath} — press Ctrl/Cmd+S to save`)
    },

    openPath,
  }

  async function openPath(target: string): Promise<void> {
    const shown = displayPathFromPath(target)
    workspace.show('pending', shown)
    statusBar.forgetSaveState()

    const trashEntryId = trashEntryIdFromPath(target)
    if (trashEntryId !== null) {
      built?.empty()
      pane.leave()
      await deletedView.offer(trashEntryId)
      announce('This entry is in the trash')

      return
    }

    const named = documentIdFromPath(target)
    options.onShowing(named)
    held.commit(named)

    await showDocumentAt(named, shown, folderIndexAlternateFromPath(target))
  }
}
