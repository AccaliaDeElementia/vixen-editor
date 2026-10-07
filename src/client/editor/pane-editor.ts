'use sanity'

import type { Dialogs } from '../files/dialogs.ts'
import type { FilesClient } from '../files/files-client.ts'
import type { Pane } from '../layout/pane.ts'
import type { StatusBar } from '../layout/status-bar.ts'
import type { Toast } from '../toast.ts'
import { createDocumentTab, type DocumentTab, type FocusListener } from './document-tab.ts'
import type { Previews } from './previews.ts'
import type { Session } from './session.ts'

interface PaneEditorOptions {
  pane: Pane
  mount: Element
  session: Session
  files: FilesClient
  dialogs: Dialogs
  toast: Toast
  statusBar: StatusBar
  previews: Previews
  documentId: () => string | null
  openUrl: (url: string) => void
  announce: (text: string) => void
  showingDocument: () => boolean
  listenForFocus?: FocusListener | undefined
}

export function createPaneEditor(options: PaneEditorOptions): DocumentTab {
  const { pane, previews, documentId } = options

  return createDocumentTab({
    mount: options.mount,
    session: options.session,
    files: options.files,
    dialogs: options.dialogs,
    toast: options.toast,
    statusBar: options.statusBar,
    documentId,
    openUrl: options.openUrl,
    announce: options.announce,
    showingDocument: options.showingDocument,
    listenForFocus: options.listenForFocus,

    onEdited: (content: string) => {
      const holder = documentId()
      if (holder !== null) pane.keepWhenOpened({ path: holder, view: 'editor' })
      previews.refreshWith(content)
    },
    onReloaded: (content: string) => {
      previews.refreshWith(content)
    },
    onCaretMoved: (offset: number) => {
      previews.revealOffset(offset)
    },
  })
}
