'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { DRAG_TAB_MIME } from '../../../../src/client/drag-payload.ts'
import { requestKeep } from '../../../../src/client/keep-request.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'
import { cast } from '../../../cast.ts'
import { givenAsync } from '../../../conditions.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  page,
  recorded,
  sessionRecording,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(): Session {
  return sessionRecording(record, {
    load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
  })
}

async function editing(): Promise<{ settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname: '/doc/notes.md',
      session: fakeSession(),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')

  return editor
}

function stripIn(pane: number): HTMLElement | null {
  const { [pane]: strip } = root.querySelectorAll<HTMLElement>('[data-part="tabs"]')

  return strip ?? null
}

function bufferIn(pane: number): string | undefined {
  const { [pane]: host } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

  return host?.querySelector<HTMLElement>('.cm-content')?.textContent
}

function selectedIn(pane: number): Array<string | undefined> {
  return [...(stripIn(pane)?.querySelectorAll<HTMLElement>('[aria-selected="true"]') ?? [])].map(
    (tab) => tab.dataset.tab,
  )
}

function dropOnto(strip: HTMLElement, identity: string): void {
  const data = cast<DataTransfer>({
    getData: (mime: string) => (mime === DRAG_TAB_MIME ? identity : ''),
    types: [DRAG_TAB_MIME],
  })

  strip.dispatchEvent(cast<DragEvent>(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: data })))
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('a tab dragged into a pane', () => {
  it('is what that pane then shows, so the strip and the page agree', async () => {
    const editor = await editing()
    requestKeep(root, 'notes.md')
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    const first = stripIn(0)
    if (first !== null) dropOnto(first, 'editor:other.md')
    await givenAsync(editor.settled())

    expect(bufferIn(0)).toBe('# other.md')
  })
})

describe('a tab dragged into the second pane while the first keeps one', () => {
  it('is what the second pane then shows, so the drop is not merely a handle moving', async () => {
    const editor = await editing()
    requestKeep(root, 'notes.md')
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())
    const first = stripIn(0)
    if (first !== null) dropOnto(first, 'editor:other.md')
    await givenAsync(editor.settled())
    requestOpenAside(root, 'third.md')
    await givenAsync(editor.settled())

    const second = stripIn(1)
    if (second !== null) dropOnto(second, 'editor:other.md')
    await givenAsync(editor.settled())

    expect(bufferIn(1)).toBe('# other.md')
  })
})

describe('a pane released while it still holds tabs', () => {
  it('shows one of the tabs it kept rather than going blank', async () => {
    const editor = await editing()
    requestKeep(root, 'notes.md')
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())
    const first = stripIn(0)
    if (first !== null) dropOnto(first, 'editor:other.md')
    await givenAsync(editor.settled())

    requestOpenAside(root, 'notes.md')
    await givenAsync(editor.settled())

    expect(bufferIn(0)).toBe('# other.md')
  })
})

describe('closing a tab in a pane that holds others', () => {
  it('raises one of the survivors, so the reader is not left on a tab that has gone', async () => {
    const editor = await editing()
    requestKeep(root, 'notes.md')
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())
    const first = stripIn(0)
    if (first !== null) dropOnto(first, 'editor:other.md')
    await givenAsync(editor.settled())

    stripIn(0)?.querySelector<HTMLElement>('[data-tab="editor:other.md"] .tabs__close')?.click()
    await givenAsync(editor.settled())

    expect(selectedIn(0)).toStrictEqual(['editor:notes.md'])
  })
})
