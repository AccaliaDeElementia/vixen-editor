'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/app/bootstrap.ts'
import type { Session } from '../../../../src/client/document/session.ts'
import { announcePanelChanged } from '../../../../src/client/platform/announce/panel-changed.ts'
import { FILES_PANEL, OUTLINE_PANEL, showPanel } from '../../../../src/client/platform/panels.ts'
import { given, givenAsync } from '../../../conditions.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  page,
  recorded,
  sessionRecording,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

import type { EditorView } from '@codemirror/view'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(content: string): Session {
  return sessionRecording(record, { load: () => Promise.resolve({ content, stored: true }) })
}

async function editing(content: string): Promise<{ view: EditorView; settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname: '/doc/notes.md',
      session: fakeSession(content),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')

  return editor
}

function showingTheOutline(): void {
  showPanel(root, OUTLINE_PANEL)
  announcePanelChanged(root)
}

function rowsShown(): Array<string | null> {
  return [...root.querySelectorAll('[data-part="outline-list"] li')].map((row) => row.textContent)
}

function saidInstead(): string {
  const said = root.querySelector<HTMLElement>('[data-part="outline-empty"]')

  return said?.hidden === false ? said.textContent : ''
}

function typing(view: EditorView, inserted: string): void {
  view.dispatch({ changes: { from: view.state.doc.length, insert: inserted } })
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('the outline of the document in front', () => {
  it('fills as soon as the reader asks for the panel', async () => {
    const editor = await editing('# alpha\n\n## beta\n')
    await givenAsync(editor.settled())

    showingTheOutline()

    expect(rowsShown()).toStrictEqual(['alpha', 'beta'])
  })

  it('is already filled for a reader who left the panel showing, rather than waiting to be reopened', async () => {
    showPanel(root, OUTLINE_PANEL)

    const editor = await editing('# kept showing\n')
    await givenAsync(editor.settled())

    expect(rowsShown()).toStrictEqual(['kept showing'])
  })

  it('follows what the reader types, so a heading just written is in the list', async () => {
    const editor = await editing('# alpha\n')
    await givenAsync(editor.settled())
    showingTheOutline()

    typing(editor.view, '\n## just written\n')

    expect(rowsShown()).toStrictEqual(['alpha', 'just written'])
  })

  it('is left alone while another panel is showing, rather than redrawn on every keystroke', async () => {
    const editor = await editing('# alpha\n')
    await givenAsync(editor.settled())
    given(() => {
      expect(rowsShown()).toStrictEqual([])
    })

    showPanel(root, FILES_PANEL)
    typing(editor.view, '\n## unseen\n')

    expect(rowsShown()).toStrictEqual([])
  })

  it('says nothing is open once the reader closes the last tab', async () => {
    const editor = await editing('# alpha\n')
    await givenAsync(editor.settled())
    root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'w', altKey: true }))
    await givenAsync(editor.settled())

    showingTheOutline()

    expect(saidInstead()).toBe('Nothing is open.')
  })
})
