'use sanity'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LoadedDocument, Session } from '../../../../src/client/editor/session.ts'
import type { EditorView } from '@codemirror/view'

import { cast } from '../../../cast.ts'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import { onStoreChanged } from '../../../../src/client/store-changed.ts'
import { TestOnly as staleBuild } from '../../../../src/client/editor/stale-build.ts'
import type { Dialogs } from '../../../../src/client/files/dialogs.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  openEditor,
  page,
  recorded,
  sessionRecording,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let afterTheCheck: () => Promise<void> = () => Promise.resolve()
let deliver: (type: string, data: string, lastEventId?: string) => void = () => undefined
let closes = 0
const standing: Array<() => void> = []
const NONE_LEFT = 0

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

function fakeChannel(): EventSource {
  const listeners = new Map<string, (event: unknown) => void>()

  deliver = (type: string, data: string, lastEventId = '') => {
    listeners.get(type)?.({ data, lastEventId })
  }

  return cast<EventSource>({
    addEventListener: (type: string, handle: (event: unknown) => void) => listeners.set(type, handle),
    removeEventListener: (type: string) => listeners.delete(type),
    close: () => {
      closes += 1
    },
  })
}

async function editing(reread: () => Promise<LoadedDocument | null>): Promise<EditorView> {
  return await openEditor({
    root,
    pathname: '/doc/notes.md',
    session: fakeSession({ load: () => Promise.resolve({ content: '# stored', stored: true }), reread }),
    openChanges: fakeChannel,
    listenForFocus: (_registered, settled) => {
      afterTheCheck = settled

      return () => undefined
    },
  })
}

function changed(): () => Promise<LoadedDocument | null> {
  return () => Promise.resolve({ content: '# changed elsewhere', stored: true })
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
  afterTheCheck = () => Promise.resolve()
  deliver = () => undefined
  closes = 0
})

describe('what the server says changed', () => {
  it('reloads the open document when the server says it was written', async () => {
    const view = await editing(changed())

    deliver('change', JSON.stringify({ kind: 'written', path: 'notes.md' }))
    await afterTheCheck()

    expect(view.state.doc.toString()).toBe('# changed elsewhere')
  })

  it('leaves the open document alone when the change names somewhere else', async () => {
    const view = await editing(changed())

    deliver('change', JSON.stringify({ kind: 'written', path: 'elsewhere.md' }))
    await afterTheCheck()

    expect(view.state.doc.toString()).toBe('# stored')
  })

  it('reloads when a folder holding the open document is moved', async () => {
    const view = await editing(changed())

    deliver('change', JSON.stringify({ kind: 'moved', from: 'notes.md', to: 'archive/notes.md' }))
    await afterTheCheck()

    expect(view.state.doc.toString()).toBe('# changed elsewhere')
  })
})

describe('coming back after the channel dropped', () => {
  it('reloads the open document, because changes during the gap were never announced', async () => {
    const view = await editing(changed())

    deliver('open', '')
    await afterTheCheck()

    expect(view.state.doc.toString()).toBe('# changed elsewhere')
  })
})

describe('letting the application go', () => {
  async function started(): Promise<{ teardownDocument: () => void; teardownApplication: () => void }> {
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        session: fakeSession(),
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
        openChanges: fakeChannel,
      }),
    )
    if (editor === null) throw new Error('the editor did not start')

    return editor
  }

  it('closes the channel, so a torn-down application holds no connection open', async () => {
    const editor = await started()

    editor.teardownApplication()

    expect(closes).toBe(1)
  })

  it('keeps listening when only the document goes, because the channel is application-wide', async () => {
    const editor = await started()

    editor.teardownDocument()

    expect(closes).toBe(0)
  })
})

describe('a server serving a newer build than this page', () => {
  function warning(): HTMLElement | null {
    return root.querySelector<HTMLElement>('#stale-build')
  }

  async function editing(dialogs: ReturnType<typeof dialogsDismissing>): Promise<void> {
    trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        servedBuild: 'built-yesterday',
        session: fakeSession(),
        files: filesAnsweringEmpty(),
        dialogs,
        openChanges: fakeChannel,
      }),
    )
  }

  it('offers the reader the choice, and marks the ribbon when they carry on', async () => {
    await editing(dialogsDismissing())

    deliver('build', 'built-today')
    await Promise.resolve()

    expect(warning()?.hidden).toBe(false)
  })

  it('says nothing when the server is serving the build this page came from', async () => {
    await editing(dialogsDismissing())

    deliver('build', 'built-yesterday')
    await Promise.resolve()

    expect(warning()?.hidden).toBe(true)
  })

  it('saves every pane before reloading, including one that holds no document yet', async () => {
    let reloads = 0
    const choosing: Dialogs = { ...dialogsDismissing(), choose: () => Promise.resolve(staleBuild.SAVE_AND_RELOAD) }
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        servedBuild: 'built-yesterday',
        session: fakeSession(),
        files: filesAnsweringEmpty(),
        dialogs: choosing,
        openChanges: fakeChannel,
        reopen: () => {
          reloads += 1
        },
      }),
    )
    if (editor === null) throw new Error('the editor did not start')
    root.querySelector<HTMLElement>('#preview-markup')?.click()

    deliver('build', 'built-today')
    await editor.settled()

    expect(reloads).toBe(1)
  })

  it('saves the one pane there is when the workspace was never split', async () => {
    let reloads = 0
    const choosing: Dialogs = { ...dialogsDismissing(), choose: () => Promise.resolve(staleBuild.SAVE_AND_RELOAD) }
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        servedBuild: 'built-yesterday',
        session: fakeSession(),
        files: filesAnsweringEmpty(),
        dialogs: choosing,
        openChanges: fakeChannel,
        reopen: () => {
          reloads += 1
        },
      }),
    )
    if (editor === null) throw new Error('the editor did not start')

    deliver('build', 'built-today')
    await editor.settled()

    expect(reloads).toBe(1)
  })
})

afterEach(() => {
  for (const release of standing.splice(NONE_LEFT)) release()
})

describe('a channel that comes back having missed something', () => {
  it('reloads the file browser, because what it last drew may name files that have gone', async () => {
    const reloads: string[] = []
    await editing(() => Promise.resolve(null))
    standing.push(
      onStoreChanged(root, () => {
        reloads.push('reloaded')
      }).offStoreChanged,
    )
    deliver('sync', '', '100')

    deliver('sync', '', '140')

    expect(reloads).toStrictEqual(['reloaded'])
  })

  it('leaves the file browser alone when nothing happened while it was away', async () => {
    const reloads: string[] = []
    await editing(() => Promise.resolve(null))
    standing.push(
      onStoreChanged(root, () => {
        reloads.push('reloaded')
      }).offStoreChanged,
    )
    deliver('sync', '', '100')

    deliver('sync', '', '100')

    expect(reloads).toStrictEqual([])
  })
})
