'use sanity'

import type { EditorView } from '@codemirror/view'

import { TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

const { bootstrap } = TestOnly

export interface Recorded {
  saved: Array<{ id: string; content: string }>
  renamed: Array<{ from: string; to: string }>
  rescued: Array<{ id: string; content: string }>
}

export function recorded(): Recorded {
  return { saved: [], renamed: [], rescued: [] }
}

const WORKSPACE = `
  <nav>
    <button type="button" id="nav-back" disabled aria-disabled="true"></button>
    <button type="button" id="nav-forward" disabled aria-disabled="true"></button>
  </nav>
  <span id="status"></span>
  <p><span id="save-label"></span><span id="save-countdown"></span></p>
  <p id="open-path"></p>
  <p id="word-count"></p>
  <div id="editor"></div>
  <section class="view" id="view-pending" tabindex="-1" hidden></section>
  <section class="view" id="view-image" tabindex="-1" hidden>
    <p id="image-path"></p>
    <a id="image-download" download></a>
    <img id="image-file" alt="">
  </section>
  <section class="view" id="view-missing" tabindex="-1" hidden>
    <code id="missing-path"></code>
  </section>
  <section class="view" id="view-deleted" tabindex="-1" hidden>
    <p id="deleted-what"></p>
    <p id="deleted-actions"><button type="button" id="deleted-restore">Restore</button></p>
    <p id="deleted-blocked" hidden></p>
  </section>
  <section class="view" id="view-unreachable" tabindex="-1" hidden>
    <p id="unreachable-reason"></p>
  </section>`

export function page({ withMount = true, withStatus = true } = {}): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = WORKSPACE

  if (!withMount) container.querySelector('#editor')?.remove()
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

export async function openEditor(options: Parameters<typeof bootstrap>[0] = {}): Promise<EditorView> {
  return await bootstrap(options)
}

export function statusText(container: ParentNode): string {
  return [...container.querySelectorAll('#status .toast')].at(-1)?.textContent ?? ''
}

export async function everyPendingMicrotask(): Promise<void> {
  const macrotaskBoundary: PromiseWithResolvers<void> = Promise.withResolvers()

  setTimeout(macrotaskBoundary.resolve)

  await macrotaskBoundary.promise
}

export async function pressSave(view: EditorView): Promise<void> {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }),
  )
  await everyPendingMicrotask()
}
