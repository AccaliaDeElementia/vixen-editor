'use sanity'

import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

import { docUrlFor, documentIdFromPath, pathAfterMove } from '../doc-path.ts'
import { onDocumentMoved } from '../document-moved.ts'
import { errorMessage } from '../error-message.ts'

import { isBlank } from '../../shared/content.ts'

import { createAutosave } from './autosave.ts'
import { caretsFollowMove, recallCaret, rememberCaret } from './carets.ts'
import { createDocumentClient } from './document-client.ts'
import { createEditorState } from './markdown-setup.ts'
import { createToast } from '../layout/toast.ts'

import { createSession, type Session } from './session.ts'
import { guardUnload } from './unload.ts'

const MOUNT_SELECTOR = '#editor'
const SAVE_KEY = 'Mod-s'

interface BootstrapOptions {
  root?: ParentNode
  pathname?: string
  session?: Session
  navigate?: (url: string) => void
  listenForUnload?: (handler: (event: BeforeUnloadEvent) => void) => void
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

async function bootstrap(options: BootstrapOptions = {}): Promise<EditorView> {
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

  const autosave = createAutosave({
    async save(content: string): Promise<void> {
      const target = documentId
      try {
        await session.save(target, content)
        rememberCaret(target, view.state.selection.main.head)
      } catch (error) {
        toast.error(`Save failed: ${errorMessage(error)}`)
        throw error
      }
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
      setStatus(`Now editing ${moved}`)
    }

    if (rewritten.includes(documentId)) {
      toast.error(`${documentId} changed on disk — reload to see the repaired links`)
    }
  })

  const initial = await session.load(documentId)
  const caret = recallCaret(documentId, initial.length)
  const view = new EditorView({
    parent: mount,
    state: createEditorState({
      doc: initial,
      selection: { anchor: caret },
      extensions: [
        basicSetup,
        keymap.of([{ key: SAVE_KEY, preventDefault: true, run: save }]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) autosave.changed(update.state.doc.toString())
        }),
      ],
    }),
  })
  autosave.reset(initial)
  view.dispatch({ effects: EditorView.scrollIntoView(caret) })

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
