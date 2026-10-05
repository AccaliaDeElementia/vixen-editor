'use sanity'

import type { EditorView } from '@codemirror/view'

import { TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'
import { cast } from '../cast.ts'
import type { Dialogs } from '../../src/client/files/dialogs.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'
import { renderPage } from './templates.ts'

const { bootstrap } = TestOnly

const standing: Array<() => void> = []
const standingViews: EditorView[] = []

export interface Recorded {
  saved: Array<{ id: string; content: string }>
  renamed: Array<{ from: string; to: string }>
  rescued: Array<{ id: string; content: string }>
}

export function recorded(): Recorded {
  return { saved: [], renamed: [], rescued: [] }
}

const STATUS_SELECTOR = '#status'

export function page({ withMount = true, withStatus = true } = {}): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderPage()

  if (!withMount) container.querySelector('[data-part="editor"]')?.remove()
  if (!withStatus) container.querySelector('#status')?.remove()

  document.body.append(container)

  return container
}

export function sessionRecording(into: Recorded, overrides: Partial<Session> = {}): Session {
  return {
    load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
    save: (id: string, content: string) => {
      into.saved.push({ id, content })
      return Promise.resolve()
    },
    saveOnUnload: (id: string, content: string) => {
      into.rescued.push({ id, content })
    },
    reread: () => Promise.resolve(null),
    rename: (from: string, to: string) => {
      into.renamed.push({ from, to })
    },
    ...overrides,
  }
}

export function filesAnsweringEmpty(): FilesClient {
  return cast<FilesClient>({
    trash: () => Promise.resolve([]),
    tree: () => Promise.resolve([]),
    trashEntry: () => Promise.resolve(null),
  })
}

export function dialogsDismissing(): Dialogs {
  return {
    prompt: () => Promise.resolve(false),
    confirm: () => Promise.resolve(false),
    choose: () => Promise.resolve(null),
    inform: () => Promise.resolve(),
  }
}

export async function openEditor(options: Parameters<typeof bootstrap>[0] = {}): Promise<EditorView> {
  const { view, teardownEditor } = await bootstrap({
    files: filesAnsweringEmpty(),
    dialogs: dialogsDismissing(),
    ...options,
  })
  standing.push(teardownEditor)

  return view
}

export function trackEditor<T extends { teardownEditor: () => void } | null>(started: T): T {
  if (started !== null) standing.push(started.teardownEditor)

  return started
}

export function trackView(view: EditorView): EditorView {
  standingViews.push(view)

  return view
}

export function closeEditors(): void {
  for (const teardownEditor of standing.splice(0)) teardownEditor()
  for (const view of standingViews.splice(0)) view.destroy()
}

export function statusText(container: ParentNode): string {
  return [...container.querySelectorAll('#status .toast')].at(-1)?.textContent ?? ''
}

export async function pressSave(view: EditorView, root: ParentNode): Promise<void> {
  const status = root.querySelector(STATUS_SELECTOR)
  if (status === null) throw new Error(`no ${STATUS_SELECTOR} to watch`)

  const spoke: PromiseWithResolvers<void> = Promise.withResolvers()
  const observer = new MutationObserver(() => {
    observer.disconnect()
    spoke.resolve()
  })
  observer.observe(status, { childList: true, subtree: true, characterData: true })

  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }),
  )

  await spoke.promise
}
