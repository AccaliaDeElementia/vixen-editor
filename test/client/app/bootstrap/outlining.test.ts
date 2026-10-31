'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/app/bootstrap.ts'
import type { Session } from '../../../../src/client/document/session.ts'
import { announcePanelChanged } from '../../../../src/client/platform/announce/panel-changed.ts'
import { TestOnly as outlineTiming } from '../../../../src/client/chrome/outline.ts'
import { requestOpenAside } from '../../../../src/client/platform/announce/open-aside.ts'
import { toggleSplit } from '../../../../src/client/workspace/split/split.ts'
import { writeKeptTabs } from '../../../../src/client/workspace/tabs/kept-tabs.ts'
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

const SECTIONS_PAST_THE_PARSE_BUDGET = 200
const LONGER_THAN_THE_EDITOR_PARSES = Array.from(
  { length: SECTIONS_PAST_THE_PARSE_BUDGET },
  (_unused, index) => `## Heading ${String(index)}\n\n${'filler prose line\n'.repeat(12)}\n`,
).join('')

const A_SECOND_HEADING = '## beta'
const TWO_HEADINGS_IN = `# alpha\n\n${A_SECOND_HEADING}\n`
const SECOND_HEADING_STARTS_AT = TWO_HEADINGS_IN.indexOf(A_SECOND_HEADING)
const PREVIEW_OF_ASIDE = { path: 'aside.md', view: 'markup' } as const
const WIDE_ENOUGH = 1200
const A_MOMENT = 1
const { OUTLINE_SETTLES_MS } = outlineTiming

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

const OPEN_DOCUMENT = 'notes.md'

function fakeSession(content: string): Session {
  return sessionRecording(record, {
    load: (id: string) => Promise.resolve({ content: id === OPEN_DOCUMENT ? content : `# ${id}`, stored: true }),
  })
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

function clickIntoThePane(index: number): void {
  const panes = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

  panes[index]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}

function clickIntoTheEditorIn(pane: number): void {
  const editors = root.querySelectorAll<HTMLElement>('[data-part="pane"] .cm-content')

  editors[pane]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}

function pressRow(index: number): void {
  root.querySelectorAll<HTMLElement>('[data-part="outline-list"] button')[index]?.click()
}

function typing(view: EditorView, inserted: string): void {
  view.dispatch({ changes: { from: view.state.doc.length, insert: inserted } })
}

afterEach(() => {
  vi.useRealTimers()
})

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

  it('follows what the reader types, once the typing has settled', async () => {
    const editor = await editing('# alpha\n')
    await givenAsync(editor.settled())
    showingTheOutline()
    vi.useFakeTimers()

    typing(editor.view, '\n## just written\n')
    await vi.advanceTimersByTimeAsync(OUTLINE_SETTLES_MS)

    expect(rowsShown()).toStrictEqual(['alpha', 'just written'])
  })

  it('leaves the list as it was until the typing settles, rather than redrawing per keystroke', async () => {
    const editor = await editing('# alpha\n')
    await givenAsync(editor.settled())
    showingTheOutline()
    vi.useFakeTimers()

    typing(editor.view, '\n## just written\n')
    await vi.advanceTimersByTimeAsync(OUTLINE_SETTLES_MS - A_MOMENT)

    expect(rowsShown()).toStrictEqual(['alpha'])
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

  it('puts the caret where the heading the reader chose begins', async () => {
    const editor = await editing(TWO_HEADINGS_IN)
    await givenAsync(editor.settled())
    showingTheOutline()

    pressRow(1)

    expect(editor.view.state.selection.main.head).toBe(SECOND_HEADING_STARTS_AT)
  })

  it('leaves the focus in the text, so the reader carries on typing where they landed', async () => {
    const editor = await editing(TWO_HEADINGS_IN)
    await givenAsync(editor.settled())
    showingTheOutline()
    document.body.focus()
    given(() => {
      expect(editor.view.hasFocus).toBe(false)
    })

    pressRow(1)

    expect(editor.view.hasFocus).toBe(true)
  })

  it('lists every heading, including the ones past what the editor has parsed for the screen', async () => {
    const editor = await editing(LONGER_THAN_THE_EDITOR_PARSES)
    await givenAsync(editor.settled())

    showingTheOutline()

    expect(rowsShown()).toHaveLength(SECTIONS_PAST_THE_PARSE_BUDGET)
  })

  it('follows the editor the reader clicks into, rather than staying with the pane they left', async () => {
    const editor = await editing(TWO_HEADINGS_IN)
    await givenAsync(editor.settled())
    requestOpenAside(root, 'aside.md')
    await givenAsync(editor.settled())
    showingTheOutline()
    given(() => {
      expect(rowsShown()).toStrictEqual(['aside.md'])
    })

    clickIntoTheEditorIn(0)

    expect(rowsShown()).toStrictEqual(['alpha', 'beta'])
  })

  it('follows a preview to the document it shows, rather than to the editor beside it', async () => {
    const editor = await editing(TWO_HEADINGS_IN)
    await givenAsync(editor.settled())
    root.querySelector<HTMLElement>('[data-part="preview-markup"]')?.click()
    await givenAsync(editor.settled())

    clickIntoThePane(1)
    showingTheOutline()

    expect(rowsShown()).toStrictEqual(['alpha', 'beta'])
  })

  it('reads a restored preview of a document no editor holds, which nothing else can answer for', async () => {
    writeKeptTabs('secondary', [PREVIEW_OF_ASIDE], PREVIEW_OF_ASIDE)
    toggleSplit(root, 'beside', WIDE_ENOUGH)
    const editor = await editing(TWO_HEADINGS_IN)
    await givenAsync(editor.settled())

    clickIntoThePane(1)
    showingTheOutline()

    expect(rowsShown()).toStrictEqual(['aside.md'])
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
