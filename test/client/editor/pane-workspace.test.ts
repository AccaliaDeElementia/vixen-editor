'use sanity'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPaneWorkspace } from '../../../src/client/editor/pane-workspace.ts'
import { createPreviews } from '../../../src/client/editor/previews.ts'
import { createToast } from '../../../src/client/toast.ts'
import type { Session } from '../../../src/client/editor/session.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  recorded,
  sessionRecording,
  type Recorded,
} from '../editor-fixtures.ts'
import { renderPane } from '../templates.ts'

const SOMETHING_STORED = '# stored'

let root: HTMLElement = document.createElement('div')
let element: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let standing: Array<() => void> = []

let rereads = 0

function fakeSession(): Session {
  return sessionRecording(record, {
    load: () => Promise.resolve({ content: SOMETHING_STORED, stored: true }),
    reread: () => {
      rereads += 1

      return Promise.resolve(null)
    },
  })
}

function paneHolding(holds: string | null): ReturnType<typeof createPaneWorkspace> {
  const built = createPaneWorkspace({
    root,
    element,
    id: 'secondary',
    holds,
    session: fakeSession(),
    files: filesAnsweringEmpty(),
    dialogs: dialogsDismissing(),
    toast: createToast(root),
    previews: createPreviews(() => undefined),
    openUrl: () => undefined,
    reopen: () => undefined,
    announce: () => undefined,
    onActivate: () => undefined,
    onCloseRequested: () => undefined,
    onTabArrived: () => undefined,
    onShowing: () => undefined,
    releaseElsewhere: () => Promise.resolve(),
  })
  standing.push(built.teardownDocument)

  return built
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  rereads = 0
  document.body.innerHTML = ''
  root = document.createElement('div')
  element = document.createElement('section')
  element.innerHTML = renderPane()
  root.append(element)
  document.body.append(root)
})

afterEach(() => {
  for (const release of standing) release()
  standing = []
})

describe('a pane that was given nothing to hold', () => {
  it('holds no document, rather than the one the page was opened on', () => {
    const pane = paneHolding(null)

    expect(pane.held.path()).toBeNull()
  })

  it('writes nothing when its editor is typed into, so it cannot overwrite a document', async () => {
    const pane = paneHolding(null)
    const { view } = pane.editor()

    view.dispatch({ changes: { from: 0, insert: 'junk from an empty pane' } })
    await pane.flush()

    expect(record.saved).toStrictEqual([])
  })
})

describe('a pane that was given a document', () => {
  it('holds it, so the pane it belongs to can save it', () => {
    const pane = paneHolding('notes.md')

    expect(pane.held.path()).toBe('notes.md')
  })

  it('writes what was typed, because it knows where it goes', async () => {
    const pane = paneHolding('notes.md')
    const { view } = pane.editor()

    view.dispatch({ changes: { from: 0, insert: 'real work' } })
    await pane.flush()

    expect(record.saved.map(({ id }) => id)).toStrictEqual(['notes.md'])
  })
})

describe('a pane whose document has left it', () => {
  async function emptied(): Promise<ReturnType<typeof createPaneWorkspace>> {
    const pane = paneHolding('notes.md')
    await pane.showDocument('notes.md')
    await pane.leave()

    return pane
  }

  it('asks the server about nothing, because it holds nothing', async () => {
    const pane = await emptied()
    rereads = 0

    await pane.editor().recheck()

    expect(rereads).toBe(0)
  })

  it('writes nothing when asked to save', async () => {
    const pane = await emptied()
    const { view } = pane.editor()
    view.dispatch({ changes: { from: 0, insert: 'typed after leaving' } })

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    await pane.flush()

    expect(record.saved).toStrictEqual([])
  })
})
