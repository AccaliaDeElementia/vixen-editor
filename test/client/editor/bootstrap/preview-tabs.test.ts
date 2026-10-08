'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { EditorView } from '@codemirror/view'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { toggleSplit } from '../../../../src/client/layout/split.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'
import { readKeptTabs, writeKeptTabs, type PaneId } from '../../../../src/client/layout/kept-tabs.ts'
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

describe('previewing into a pane that is already showing an editor', () => {
  it('puts the preview in the other pane, leaving the editor where the reader had it', async () => {
    const editor = await reopened()
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    root.querySelector<HTMLElement>('#preview-markup')?.click()
    await givenAsync(editor.settled())

    expect(shownIn(1)).toStrictEqual(['editor'])
  })

  it('shows the preview alone there, rather than beside an editor', async () => {
    const editor = await reopened()
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    root.querySelector<HTMLElement>('#preview-markup')?.click()
    await givenAsync(editor.settled())

    expect(shownIn(0)).toStrictEqual(['view-markup'])
  })

  it('paints what that editor holds, so the preview is not an empty panel', async () => {
    const editor = await reopened()
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    root.querySelector<HTMLElement>('#preview-markup')?.click()
    await givenAsync(editor.settled())

    expect(markupIn(0)).toContain('other.md')
  })

  it('keeps the preview tab as permanent when the editor it mirrors is permanent', async () => {
    const editor = await reopened()
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())
    root
      .querySelector<HTMLElement>('[data-tab="editor:other.md"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    root.querySelector<HTMLElement>('#preview-markup')?.click()
    await givenAsync(editor.settled())

    expect(readKeptTabs('primary').tabs).toStrictEqual([{ path: 'other.md', view: 'markup' }])
  })
})

describe('clicking the preview tab beside the editor it mirrors', () => {
  const EDITING = { path: 'notes.md', view: 'editor' } as const
  const PREVIEWING = { path: 'notes.md', view: 'markup' } as const

  async function openedOnTheEditorIn(pane: PaneId): Promise<{ settled: () => Promise<void> }> {
    writeKeptTabs(pane, [EDITING, PREVIEWING], EDITING)
    if (pane === 'secondary') toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopened()
    await givenAsync(editor.settled())

    return editor
  }

  async function clickedThePreviewTabIn(pane: number, editor: { settled: () => Promise<void> }): Promise<void> {
    const { [pane]: host } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')
    host?.querySelector<HTMLElement>('[data-tab="markup:notes.md"]')?.click()
    await editor.settled()
  }

  it('shows the preview alone, rather than stacked above the editor it replaces', async () => {
    const editor = await openedOnTheEditorIn('primary')

    await clickedThePreviewTabIn(0, editor)

    expect(shownIn(0)).toStrictEqual(['view-markup'])
  })

  it('does as much in a pane beside the first, which hides its own editor and no other', async () => {
    const editor = await openedOnTheEditorIn('secondary')

    await clickedThePreviewTabIn(1, editor)

    expect(shownIn(1)).toStrictEqual(['view-markup'])
  })

  it('marks that tab as the one in front, so the strip says what the pane is showing', async () => {
    const editor = await openedOnTheEditorIn('primary')

    await clickedThePreviewTabIn(0, editor)

    expect(root.querySelector('[data-tab="markup:notes.md"]')?.getAttribute('aria-selected')).toBe('true')
  })

  it('paints what the editor beside it holds, not what some other pane is editing', async () => {
    const editor = await openedOnTheEditorIn('secondary')

    await clickedThePreviewTabIn(1, editor)

    expect(markupIn(1)).toContain('notes.md')
  })
})
