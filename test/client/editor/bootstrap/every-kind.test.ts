'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'
import { applySplit } from '../../../../src/client/layout/split.ts'
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

const WIDE_ENOUGH = 1200

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(): Session {
  return sessionRecording(record, {
    load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
  })
}

async function editing(pathname = '/doc/notes.md'): Promise<{ settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname,
      session: fakeSession(),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')

  return editor
}

function reopenThePage(): void {
  document.body.innerHTML = ''
  root = page()
  applySplit(root, WIDE_ENOUGH)
}

function shownIn(pane: number): Array<string | undefined> {
  const { [pane]: host } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

  return [...(host?.querySelectorAll<HTMLElement>('[data-part="editor"], [data-part^="view-"]') ?? [])]
    .filter((element) => element.hidden === false)
    .flatMap((element) => element.dataset.part ?? [])
}

function tabsIn(pane: number): Array<string | undefined> {
  const { [pane]: strip } = root.querySelectorAll<HTMLElement>('[data-part="tabs"]')

  return [...(strip?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])].map((tab) => tab.dataset.tab)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('asking for the same image aside twice', () => {
  it('leaves one image, because a document has one view of each kind wherever it sits', async () => {
    const editor = await editing()
    requestOpenAside(root, 'photo.png')
    await givenAsync(editor.settled())

    requestOpenAside(root, 'photo.png')
    await givenAsync(editor.settled())

    expect(root.querySelectorAll('[data-tab="image:photo.png"]')).toHaveLength(1)
  })
})

describe('asking for the same document aside twice', () => {
  it('leaves no blank editor behind in the pane it came from', async () => {
    const editor = await editing()
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    expect(shownIn(1)).toStrictEqual([])
  })
})

describe('a pane that comes back holding tabs', () => {
  it('shows the one it was on, without the reader having to click it', async () => {
    const first = await editing()
    requestOpenAside(root, 'other.md')
    await givenAsync(first.settled())
    root
      .querySelector<HTMLElement>('[data-tab="editor:other.md"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    reopenThePage()

    const again = await editing()
    await givenAsync(again.settled())

    expect(shownIn(1)).toStrictEqual(['editor'])
  })
})

describe('a document the url names that the second pane already holds', () => {
  it('comes back in that pane, not dragged into the first', async () => {
    const first = await editing()
    requestOpenAside(root, 'other.md')
    await givenAsync(first.settled())
    for (const identity of ['editor:notes.md', 'editor:other.md']) {
      root
        .querySelector<HTMLElement>(`[data-tab="${identity}"]`)
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    }
    reopenThePage()

    const again = await editing('/doc/other.md')
    await givenAsync(again.settled())

    expect(tabsIn(1)).toStrictEqual(['editor:other.md'])
  })
})
