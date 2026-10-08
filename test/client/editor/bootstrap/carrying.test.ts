'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'
import { undoDepth } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { requestKeep } from '../../../../src/client/keep-request.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'
import { readKeptTabs } from '../../../../src/client/layout/kept-tabs.ts'
import { DRAG_TAB_MIME } from '../../../../src/client/drag-payload.ts'
import { cast } from '../../../cast.ts'
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

const TYPED = ' and more'
const SOMEWHERE_IN_THE_MIDDLE = 3
const ONE_TAB = 1
const FIRST_PANE = 0

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, {
    load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
    ...overrides,
  })
}

async function editing(session: Session = fakeSession()): Promise<{ view: EditorView; settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname: '/doc/notes.md',
      session,
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')
  requestKeep(root, 'notes.md')

  return editor
}

function dropOnto(strip: HTMLElement, identity: string): void {
  const data = cast<DataTransfer>({
    getData: (mime: string) => (mime === DRAG_TAB_MIME ? identity : ''),
    types: [DRAG_TAB_MIME],
  })

  strip.dispatchEvent(cast<DragEvent>(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: data })))
}

function carryToTheOtherPane(key = 'ArrowRight'): void {
  root.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      altKey: true,
      ctrlKey: true,
      shiftKey: true,
    }),
  )
}

function editorHoldingTheTab(): EditorView | null {
  const holder = [...root.querySelectorAll<HTMLElement>('[data-part="pane"]')].find(
    (pane) => pane.querySelector('[data-tab="editor:notes.md"]') !== null,
  )
  const content = holder?.querySelector<HTMLElement>('.cm-content') ?? null

  return content === null ? null : EditorView.findFromDOM(content)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('carrying a document that has unsaved work to the other pane', () => {
  it('takes the text across, rather than re-reading what the store still holds', async () => {
    const editor = await editing()
    editor.view.dispatch({ changes: { from: editor.view.state.doc.length, insert: TYPED } })

    carryToTheOtherPane()
    await givenAsync(editor.settled())

    expect(editorHoldingTheTab()?.state.doc.toString()).toBe(`# notes.md${TYPED}`)
  })

  it('takes the caret across, because it lives in the state the carry hands over', async () => {
    const editor = await editing()
    editor.view.dispatch({ selection: { anchor: SOMEWHERE_IN_THE_MIDDLE } })

    carryToTheOtherPane()
    await givenAsync(editor.settled())

    expect(editorHoldingTheTab()?.state.selection.main.head).toBe(SOMEWHERE_IN_THE_MIDDLE)
  })

  it('takes the undo history across, so the reader can still take back what they typed', async () => {
    const editor = await editing()
    editor.view.dispatch({ changes: { from: editor.view.state.doc.length, insert: TYPED } })

    carryToTheOtherPane()
    await givenAsync(editor.settled())

    expect(undoDepth(editorHoldingTheTab()?.state ?? editor.view.state)).toBeGreaterThan(0)
  })
})

describe('carrying a document the store refuses to save', () => {
  it('leaves one editor holding the work, in the pane it was carried to', async () => {
    const editor = await editing(fakeSession({ save: () => Promise.reject(new Error('the store refused')) }))
    editor.view.dispatch({ changes: { from: editor.view.state.doc.length, insert: TYPED } })

    carryToTheOtherPane()
    await givenAsync(editor.settled())

    expect(root.querySelectorAll('[data-tab="editor:notes.md"]')).toHaveLength(1)
  })
})

describe('collapsing onto a pane that was showing something no editor holds', () => {
  it('opens it afresh, because there is no live state to hand over for an image', async () => {
    const editor = await editing()
    requestOpenAside(root, 'photo.png')
    await givenAsync(editor.settled())

    root.querySelector<HTMLElement>('[data-tab="editor:notes.md"] .tabs__close')?.click()
    await givenAsync(editor.settled())

    expect(root.querySelectorAll('[data-tab="image:photo.png"]')).toHaveLength(ONE_TAB)
  })
})

describe('what is written down the instant a tab is dragged out of the first pane', () => {
  async function draggedAcross(): Promise<void> {
    const editor = await editing()
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())
    root
      .querySelector<HTMLElement>('[data-tab="editor:other.md"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    const [, aside] = root.querySelectorAll<HTMLElement>('[data-part="tabs"]')
    if (aside !== undefined) dropOnto(aside, 'editor:notes.md')
    await givenAsync(editor.settled())
  }

  it('keeps an image dragged out of the last tab, rather than losing it with the pane that went', async () => {
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/photo.png',
        session: fakeSession(),
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (editor === null) throw new Error('the editor did not start')
    requestKeep(root, 'photo.png')
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    const [, aside] = root.querySelectorAll<HTMLElement>('[data-part="tabs"]')
    if (aside !== undefined) dropOnto(aside, 'image:photo.png')
    await givenAsync(editor.settled())

    expect(readKeptTabs('secondary').tabs).toStrictEqual([])
  })

  it('leaves the pane that went with nothing recorded, so a later split does not resurrect it', async () => {
    await draggedAcross()

    expect(readKeptTabs('secondary').tabs).toStrictEqual([])
  })

  it('records both tabs against the pane that survived, so neither is lost to the collapse', async () => {
    await draggedAcross()

    expect(
      readKeptTabs('primary')
        .tabs.map((at) => at.path)
        .sort(),
    ).toStrictEqual(['notes.md', 'other.md'])
  })
})

describe('carrying a tab that is not an editor to the other pane', () => {
  function paneAt(index: number): HTMLElement | undefined {
    const { [index]: held } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

    return held
  }

  function shownIn(pane: number, part: string): string {
    return paneAt(pane)?.querySelector<HTMLElement>(`[data-part="${part}"]`)?.textContent ?? ''
  }

  async function carryingAnImageBack(): Promise<void> {
    const editor = await editing()
    requestOpenAside(root, 'photo.png')
    await givenAsync(editor.settled())
    given(() => {
      expect(shownIn(FIRST_PANE, 'image-path')).toBe('')
    })

    carryToTheOtherPane('ArrowLeft')
    await givenAsync(editor.settled())
  }

  it('offers it to the pane it arrives in, rather than leaving that pane never told', async () => {
    await carryingAnImageBack()

    expect(shownIn(FIRST_PANE, 'image-path')).toBe('photo.png')
  })

  it('brings the tab with it, so the pane it arrives in holds what it was asked to show', async () => {
    await carryingAnImageBack()

    expect(paneAt(FIRST_PANE)?.querySelector('[data-tab="image:photo.png"]')).not.toBeNull()
  })
})
