'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { EditorView } from '@codemirror/view'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { toggleSplit } from '../../../../src/client/layout/split.ts'
import { writeKeptTabs } from '../../../../src/client/layout/kept-tabs.ts'
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

const WIDE_ENOUGH = 1200
const IMAGE = { path: 'photo.png', view: 'image' } as const

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function typedIntoTheFirstPane(text: string): void {
  const content = root.querySelector<HTMLElement>('.cm-content')
  const view = content === null ? null : EditorView.findFromDOM(content)
  view?.dispatch({ changes: { from: view.state.doc.length, insert: text } })
}

async function reopenedWith(load: Session['load'], search = ''): Promise<{ settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname: '/doc/notes.md',
      search,
      session: sessionRecording(record, { load }),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')

  return editor
}

async function reopened(): Promise<{ settled: () => Promise<void> }> {
  return await reopenedWith((id: string) => Promise.resolve({ content: `# ${id}`, stored: true }))
}

async function reopenedAt(search: string): Promise<{ settled: () => Promise<void> }> {
  return await reopenedWith((id: string) => Promise.resolve({ content: `# ${id}`, stored: true }), search)
}

function tabsIn(pane: number): Array<string | undefined> {
  const { [pane]: host } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

  return [...(host?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])].map((tab) => tab.dataset.tab)
}

function shownIn(pane: number): Array<string | undefined> {
  const { [pane]: host } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

  return [...(host?.querySelectorAll<HTMLElement>('[data-part="editor"], [data-part^="view-"]') ?? [])]
    .filter((element) => element.hidden === false)
    .flatMap((element) => element.dataset.part ?? [])
}

function markupIn(pane: number): string | undefined {
  const { [pane]: host } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

  return host?.querySelector<HTMLElement>('[data-part="markup-body"]')?.textContent ?? undefined
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('a pane that comes back on a preview tab', () => {
  it('paints it, so the reader does not have to click the tab they were already on', async () => {
    const at = { path: 'other.md', view: 'markup' } as const
    writeKeptTabs('secondary', [at], at)
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopened()
    await givenAsync(editor.settled())

    expect(markupIn(1)).toContain('other.md')
  })

  it('names what it is showing, so the pane is not silent about it', async () => {
    const at = { path: 'other.md', view: 'source' } as const
    writeKeptTabs('secondary', [at], at)
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopened()
    await givenAsync(editor.settled())

    const [, aside] = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

    expect(aside?.querySelector<HTMLElement>('[data-part="view-source"]')?.hidden).toBe(false)
  })
})

describe('a pane that comes back on a preview of the very document the url opens', () => {
  it('paints it, rather than reading the editor that has not loaded it yet', async () => {
    const at = { path: 'notes.md', view: 'markup' } as const
    writeKeptTabs('secondary', [at], at)
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopened()
    await givenAsync(editor.settled())

    expect(markupIn(1)).toContain('notes.md')
  })
})

describe('a preview the pane lands on when the tab beside it closes', () => {
  it('paints what the editor holding that document has, not what the store last took', async () => {
    const previewing = { path: 'notes.md', view: 'markup' } as const
    const beside = { path: 'other.md', view: 'editor' } as const
    writeKeptTabs('secondary', [previewing, beside], beside)
    toggleSplit(root, 'beside', WIDE_ENOUGH)
    const editor = await reopened()
    await givenAsync(editor.settled())
    typedIntoTheFirstPane(' and typed')

    root.querySelector<HTMLElement>('[data-tab="editor:other.md"] .tabs__close')?.click()
    await givenAsync(editor.settled())

    expect(markupIn(1)).toContain('and typed')
  })
})

describe('a preview of a document the store will not give back', () => {
  it('paints nothing rather than failing, because a preview is not worth an error', async () => {
    const at = { path: 'gone.md', view: 'markup' } as const
    writeKeptTabs('secondary', [at], at)
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopenedWith(() => Promise.reject(new Error('the store refused')))
    await givenAsync(editor.settled())

    expect(markupIn(1)).toBe('')
  })
})

describe('a preview the reader moved to the pane its editor is in', () => {
  async function reopenedWithThePreviewCarried(): Promise<{ settled: () => Promise<void> }> {
    const previewing = { path: 'notes.md', view: 'markup' } as const
    writeKeptTabs('primary', [{ path: 'notes.md', view: 'editor' }, previewing], previewing)
    writeKeptTabs('secondary', [IMAGE], IMAGE)
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopenedAt('?view=preview')
    await givenAsync(editor.settled())

    return editor
  }

  it('stays in that pane after a reload, rather than being summoned back to the other', async () => {
    await reopenedWithThePreviewCarried()

    expect(tabsIn(0)).toStrictEqual(['editor:notes.md', 'markup:notes.md'])
  })

  it('is what that pane shows, because it is the tab the reader was on', async () => {
    await reopenedWithThePreviewCarried()

    expect(markupIn(0)).toContain('notes.md')
  })

  it('leaves the other pane showing what it held, rather than taking it over', async () => {
    await reopenedWithThePreviewCarried()

    given(() => {
      const [, aside] = root.querySelectorAll<HTMLElement>('[data-part="pane"]')
      aside?.querySelector('[data-part="image-file"]')?.dispatchEvent(new Event('load'))
    })

    expect(shownIn(1)).toStrictEqual(['view-image'])
  })
})
