'use sanity'

import type { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

import { displayPathFromPath, docUrlFor, documentIdFromPath, namesFolderIndex, pathAfterMove } from '../doc-path.ts'
import { onDocumentMoved } from '../document-moved.ts'
import { errorMessage } from '../error-message.ts'

import { isBlank } from '../../shared/content.ts'

import { createAutosave } from './autosave.ts'
import { caretsFollowMove, recallCaret, rememberCaret } from './carets.ts'
import { createDocumentClient } from './document-client.ts'
import { createEditorState } from './markdown-setup.ts'
import { createToast } from '../layout/toast.ts'
import { createStatusBar } from '../layout/status-bar.ts'
import { createWorkspace } from '../layout/workspace.ts'

import { createSession, type LoadedDocument, type Session } from './session.ts'
import { guardUnload } from './unload.ts'

const MOUNT_SELECTOR = '#editor'
const SAVE_KEY = 'Mod-s'
const UNREACHABLE_REASON_SELECTOR = '#unreachable-reason'
const TOP_OF_DOCUMENT = 0

interface BootstrapOptions {
  root?: ParentNode
  pathname?: string
  session?: Session
  navigate?: (url: string) => void
  listenForUnload?: (handler: (event: BeforeUnloadEvent) => void) => void
}

type LoadOutcome = { reached: true; document: LoadedDocument } | { reached: false; error: unknown }

async function loadOrReport(session: Session, id: string): Promise<LoadOutcome> {
  try {
    return { reached: true, document: await session.load(id) }
  } catch (error) {
    return { reached: false, error }
  }
}

function reportUnreachable(root: ParentNode, at: string, error: unknown): void {
  const reason = root.querySelector(UNREACHABLE_REASON_SELECTOR)
  if (reason === null) return

  const subject = at === '' ? 'The store' : at
  reason.textContent = `${subject} could not be loaded: ${errorMessage(error)}`
}

function caretIn(state: EditorState): number {
  return state.selection.main.head
}

function replaceAddress(url: string): void {
  window.history.replaceState(null, '', url)
}

class MissingMountError extends Error {
  override readonly name = 'MissingMountError'

  constructor(selector: string) {
    super(`Missing editor mount point: ${selector}`)
  }
}

async function bootstrap(options: BootstrapOptions = {}): Promise<EditorView | null> {
  const root = options.root ?? document
  const pathname = options.pathname ?? window.location.pathname
  const session = options.session ?? createSession(createDocumentClient())

  const toast = createToast(root)
  const setStatus = (text: string): void => {
    toast.show(text)
  }

  const mount = root.querySelector(MOUNT_SELECTOR)
  if (mount === null) {
    setStatus(`Failed to start: ${new MissingMountError(MOUNT_SELECTOR).message}`)
    throw new MissingMountError(MOUNT_SELECTOR)
  }

  const navigate = options.navigate ?? replaceAddress
  let documentId = documentIdFromPath(pathname)
  const shownPath = displayPathFromPath(pathname)

  const workspace = createWorkspace(root, {
    focusDocument: () => {
      view.focus()
    },
  })
  workspace.show('pending', shownPath)

  const statusBar = createStatusBar(root)
  statusBar.showPath(shownPath)

  let caretPosition = TOP_OF_DOCUMENT

  async function writeDocument(content: string): Promise<void> {
    const target = documentId
    try {
      await session.save(target, content)
      rememberCaret(target, caretPosition)
    } catch (error) {
      toast.error(`Save failed: ${errorMessage(error)}`)
      throw error
    }
  }

  const autosave = createAutosave({
    save: writeDocument,
    report: (state) => {
      statusBar.showSaveState(state, autosave.dueAt())
    },
  })

  const save = (): boolean => {
    const target = documentId
    if (autosave.state() === 'clean') {
      setStatus(`No changes in ${target}`)
      return true
    }

    void autosave.flush().then(() => {
      if (autosave.state() === 'clean') setStatus(`Saved ${target}`)
    })

    return true
  }

  onDocumentMoved(root, ({ from, to, rewritten }) => {
    caretsFollowMove({ from, to })
    const moved = pathAfterMove({ from, to }, documentId)

    if (moved !== documentId) {
      session.rename(documentId, moved)
      documentId = moved
      navigate(docUrlFor(moved))
      statusBar.showPath(moved)
      setStatus(`Now editing ${moved}`)
    }

    if (rewritten.includes(documentId)) {
      toast.error(`${documentId} changed on disk — reload to see the repaired links`)
    }
  })

  const outcome = await loadOrReport(session, documentId)
  if (!outcome.reached) {
    reportUnreachable(root, shownPath, outcome.error)
    workspace.show('unreachable', shownPath)

    return null
  }

  const { document: loaded } = outcome
  const { content: initial, stored } = loaded
  if (!stored && !namesFolderIndex(pathname)) {
    workspace.show('missing', shownPath)

    return null
  }

  const caret = recallCaret(documentId, initial.length)
  caretPosition = caret
  const view = new EditorView({
    parent: mount,
    state: createEditorState({
      doc: initial,
      selection: { anchor: caret },
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        keymap.of([{ key: SAVE_KEY, preventDefault: true, run: save }]),
        EditorView.updateListener.of((update) => {
          caretPosition = caretIn(update.state)
          if (!update.docChanged) return

          const content = update.state.doc.toString()
          autosave.changed(content)
          statusBar.showWordCount(content)
        }),
      ],
    }),
  })
  autosave.reset(initial)
  statusBar.showWordCount(initial)
  view.dispatch({ effects: EditorView.scrollIntoView(caret) })
  workspace.show('document', shownPath)

  guardUnload({
    unsaved: () => autosave.state() !== 'clean',
    rescue: () => {
      const content = view.state.doc.toString()
      if (!isBlank(content)) session.saveOnUnload(documentId, content)
    },
    listen: options.listenForUnload,
  })

  setStatus(`Editing ${documentId} — press Ctrl/Cmd+S to save`)

  return view
}

export async function bootstrapOrReport(options: BootstrapOptions = {}): Promise<EditorView | null> {
  return await bootstrap(options).catch((error: unknown) => {
    createToast(options.root ?? document).show(`Failed to start: ${errorMessage(error)}`)
    return null
  })
}

export const TestOnly = { MissingMountError, bootstrap }
