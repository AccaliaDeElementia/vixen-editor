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

export function page({ withMount = true, withStatus = true } = {}): HTMLElement {
  const container = document.createElement('div')
  if (withStatus) {
    const status = document.createElement('span')
    status.id = 'status'
    container.append(status)
  }
  if (withMount) {
    const mount = document.createElement('div')
    mount.id = 'editor'
    container.append(mount)
  }
  for (const view of ['pending', 'missing', 'deleted', 'unreachable']) {
    const section = document.createElement('section')
    section.id = `view-${view}`
    section.tabIndex = -1
    section.hidden = true
    container.append(section)
  }
  const missingPath = document.createElement('code')
  missingPath.id = 'missing-path'
  container.querySelector('#view-missing')?.append(missingPath)

  const reason = document.createElement('p')
  reason.id = 'unreachable-reason'
  container.querySelector('#view-unreachable')?.append(reason)

  const deleted = container.querySelector('#view-deleted')
  deleted?.insertAdjacentHTML(
    'afterbegin',
    `<p id="deleted-what"></p>
     <p id="deleted-actions"><button type="button" id="deleted-restore">Restore</button></p>
     <p id="deleted-blocked" hidden></p>`,
  )

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
    rename: (from: string, to: string) => {
      into.renamed.push({ from, to })
    },
    ...overrides,
  }
}

export async function openEditor(options: Parameters<typeof bootstrap>[0] = {}): Promise<EditorView> {
  const view = await bootstrap(options)
  if (view === null) throw new Error('expected the editor to open')

  return view
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
