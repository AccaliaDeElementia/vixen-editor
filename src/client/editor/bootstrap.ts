'use sanity'

import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

import { docUrlFor, documentIdFromPath, pathAfterMove } from '../doc-path.ts'
import { onDocumentMoved } from '../document-moved.ts'

import { createDocumentClient } from './document-client.ts'
import { createEditorState } from './markdown-setup.ts'
import { createToast } from '../layout/toast.ts'

import { createSession, type Session } from './session.ts'

const MOUNT_SELECTOR = '#editor'
const SAVE_KEY = 'Mod-s'

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

interface BootstrapOptions {
  root?: ParentNode
  pathname?: string
  session?: Session
  navigate?: (url: string) => void
}

// The document moved, it did not navigate — the buffer, the scroll position
// and any unsaved edit all stay exactly as they are, so the old address must
// not be left behind in the history for Back to return to.
function replaceAddress(url: string): void {
  window.history.replaceState(null, '', url)
}

class MissingMountError extends Error {
  override readonly name = 'MissingMountError'

  constructor(selector: string) {
    super(`Missing editor mount point: ${selector}`)
  }
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<EditorView> {
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

  const save = (view: EditorView): boolean => {
    const target = documentId
    void session
      .save(target, view.state.doc.toString())
      .then(() => {
        setStatus(`Saved ${target}`)
      })
      .catch((error: unknown) => {
        toast.error(`Save failed: ${describeError(error)}`)
      })
    return true
  }

  onDocumentMoved(root, ({ from, to, rewritten }) => {
    const moved = pathAfterMove({ from, to }, documentId)

    if (moved !== documentId) {
      session.rename(documentId, moved)
      documentId = moved
      navigate(docUrlFor(moved))
      setStatus(`Now editing ${moved}`)
    }

    // The bytes on disk are newer than the buffer in front of the user, and
    // overwriting them silently is the one thing a save must not do. The etag
    // the session carried across is stale, so a save answers 412 — this is
    // the warning that explains why.
    if (rewritten.includes(documentId)) {
      toast.error(`${documentId} changed on disk — reload to see the repaired links`)
    }
  })

  const view = new EditorView({
    parent: mount,
    state: createEditorState({
      doc: await session.load(documentId),
      extensions: [basicSetup, keymap.of([{ key: SAVE_KEY, preventDefault: true, run: save }])],
    }),
  })

  setStatus(`Editing ${documentId} — press Ctrl/Cmd+S to save`)
  return view
}

export async function bootstrapOrReport(options: BootstrapOptions = {}): Promise<EditorView | null> {
  return await bootstrap(options).catch((error: unknown) => {
    createToast(options.root ?? document).show(`Failed to start: ${describeError(error)}`)
    return null
  })
}

export const TestOnly = { MissingMountError, describeError }
