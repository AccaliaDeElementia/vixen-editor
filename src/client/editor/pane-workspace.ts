'use sanity'

import { EMPTY } from '../../shared/sequences.ts'
import { classifyFile } from '../../shared/documents.ts'
import { directoryOf } from '../../shared/link-paths.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'
import { trashEntryIdFromPath } from '../../shared/page-urls.ts'
import { displayPathFromPath, documentIdFromPath, folderIndexAlternateFromPath } from '../doc-path.ts'
import type { TabAt } from '../layout/open-tabs.ts'
import type { PaneId } from '../layout/kept-tabs.ts'
import { cheatsheet } from '../help.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { FilesClient } from '../files/files-client.ts'
import { createDeletedView } from '../layout/deleted-view.ts'
import { createImageView } from '../layout/image-view.ts'
import { createMissingView } from '../layout/missing-view.ts'
import { createPane, type Pane } from '../layout/pane.ts'
import { createStatusBar, type StatusBar } from '../layout/status-bar.ts'
import { createWorkspace, type Workspace } from '../layout/workspace.ts'
import { openDocumentIn, type OpenDocument } from '../navigation.ts'
import type { Toast } from '../toast.ts'
import type { DocumentTab, FocusListener } from './document-tab.ts'
import { resolveIndex } from './folder-index.ts'
import { createPaneEditor } from './pane-editor.ts'
import type { Previews } from './previews.ts'
import type { Session } from './session.ts'
import { errorMessage } from '../error-message.ts'

const MOUNT_SELECTOR = '[data-part="editor"]'
const UNREACHABLE_REASON_SELECTOR = '[data-part="unreachable-reason"]'

export class MissingMountError extends Error {
  override readonly name = 'MissingMountError'

  constructor(selector: string) {
    super(`Missing editor mount point: ${selector}`)
  }
}

interface PaneWorkspaceOptions {
  root: ParentNode
  element: HTMLElement
  id: PaneId
  pathname: string
  session: Session
  files: FilesClient
  dialogs: Dialogs
  toast: Toast
  previews: Previews
  openUrl: (url: string) => void
  reopen: () => void
  announce: (text: string) => void
  onActivate: (at: TabAt) => void
  onCloseRequested: (at: TabAt) => void
  onTabArrived: (identity: string, toIndex: number) => void
  onShowing: (entryPath: string) => void
  releaseElsewhere: (at: TabAt) => void
  listenForFocus?: FocusListener | undefined
}

export interface PaneWorkspace {
  element: HTMLElement
  statusBar: StatusBar
  pane: Pane
  held: OpenDocument
  editor: () => DocumentTab
  teardownDocument: () => void
  workspace: Workspace
  openPath: (target: string) => Promise<void>
  showDocument: (entryPath: string) => Promise<void>
  leave: () => void
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

  const held = openDocumentIn(element, options.pathname)
  const statusBar = createStatusBar(element)
  const pane = createPane(element, options.id, {
    onActivate: options.onActivate,
    onCloseRequested: options.onCloseRequested,
    onTabArrived: options.onTabArrived,
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
      showingDocument: () => workspace.showing() === 'document',
      listenForFocus: options.listenForFocus,
    })

    return built
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
    },
  })

  const missingView = createMissingView({ host: element, client: files, toast, reopen: options.reopen })

  function showMissing(entryPath: string, shown: string): void {
    built?.empty()
    pane.leave()
    workspace.show('missing', shown)
    missingView.offer(entryPath)
    announce(`${shown} is not in the store`)
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

  async function showDocumentAt(entryPath: string, shown: string, alternate: string | null): Promise<void> {
    const outcome = await resolveIndex(session, entryPath, alternate)
    if (!outcome.reached) {
      built?.empty()
      pane.leave()
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
    options.releaseElsewhere(at)
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

    teardownDocument: () => {
      built?.teardownDocument()
      built = null
    },

    showDocument: async (entryPath: string) => {
      await showDocumentAt(entryPath, entryPath, null)
    },

    leave: () => {
      built?.empty()
      pane.leave()
    },

    openPath: async (target: string) => {
      const shown = displayPathFromPath(target)
      workspace.show('pending', shown)
      statusBar.forgetSaveState()

      const trashEntryId = trashEntryIdFromPath(target)
      if (trashEntryId !== null) {
        built?.empty()
        pane.leave()
        deletedView.offer(trashEntryId)
        announce('This entry is in the trash')

        return
      }

      const named = documentIdFromPath(target)
      options.onShowing(named)
      held.commit(named)

      if (classifyFile(named) === 'image') {
        built?.empty()
        pane.leave()
        imageView.offer(named)
        announce(`Viewing ${named}`)

        return
      }

      await showDocumentAt(named, shown, folderIndexAlternateFromPath(target))
    },
  }
}
