'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import type { LoadedDocument, Session } from '../../../../src/client/editor/session.ts'
import type { EditorView } from '@codemirror/view'

import { cast } from '../../../cast.ts'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
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
let deliver: (type: string, data: string) => void = () => undefined
let closes = 0

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

function fakeChannel(): EventSource {
  const listeners = new Map<string, (event: unknown) => void>()

  deliver = (type: string, data: string) => {
    listeners.get(type)?.({ data })
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
