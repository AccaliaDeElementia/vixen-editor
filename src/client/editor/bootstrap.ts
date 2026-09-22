'use sanity'

import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

import { createDocumentClient } from './document-client.ts'
import { createEditorState } from './markdown-setup.ts'
import { createToast } from '../layout/toast.ts'

import { createSession, type Session } from './session.ts'

export const DEFAULT_DOCUMENT = 'welcome.md'
export const MOUNT_SELECTOR = '#editor'
export { TOAST_SELECTOR as STATUS_SELECTOR } from '../layout/toast.ts'
export const DOCUMENT_QUERY_PARAM = 'doc'
export const SAVE_KEY = 'Mod-s'

export function documentIdFromSearch(search: string): string {
  return new URLSearchParams(search).get(DOCUMENT_QUERY_PARAM) ?? DEFAULT_DOCUMENT
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

export interface BootstrapOptions {
  root?: ParentNode
  search?: string
  session?: Session
}

export class MissingMountError extends Error {
  override readonly name = 'MissingMountError'

  constructor(selector: string) {
    super(`Missing editor mount point: ${selector}`)
  }
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<EditorView> {
  const root = options.root ?? document
  const search = options.search ?? window.location.search
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

  const documentId = documentIdFromSearch(search)

  const save = (view: EditorView): boolean => {
    void session
      .save(documentId, view.state.doc.toString())
      .then(() => {
        setStatus(`Saved ${documentId}`)
      })
      .catch((error: unknown) => {
        setStatus(`Save failed: ${describeError(error)}`)
      })
    return true
  }

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
