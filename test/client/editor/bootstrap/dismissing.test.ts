'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'
import { requestKeep } from '../../../../src/client/keep-request.ts'
import { requestSplitDismissed } from '../../../../src/client/split-changed.ts'
import { readKeptTabs } from '../../../../src/client/layout/kept-tabs.ts'
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

async function splitWithBoth(): Promise<{ settled: () => Promise<void> }> {
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
  requestKeep(root, 'notes.md')
  requestOpenAside(root, 'other.md')
  await givenAsync(editor.settled())
  requestKeep(root, 'other.md')

  return editor
}

function dismissFromTheRibbon(): void {
  requestSplitDismissed(root)
}

function tabsIn(pane: number): Array<string | undefined> {
  const { [pane]: strip } = root.querySelectorAll<HTMLElement>('[data-part="tabs"]')

  return [...(strip?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])].map((tab) => tab.dataset.tab)
}

function bufferIn(pane: number): string | undefined {
  const { [pane]: host } = root.querySelectorAll<HTMLElement>('[data-part="pane"]')

  return host?.querySelector<HTMLElement>('.cm-content')?.textContent
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('dismissing a pane that still holds tabs from the ribbon', () => {
  it('brings its tabs to the pane that survives, rather than hiding them', async () => {
    const editor = await splitWithBoth()

    dismissFromTheRibbon()
    await givenAsync(editor.settled())

    expect(tabsIn(0)).toStrictEqual(['editor:other.md', 'editor:notes.md'])
  })

  it('shows the tab the reader was most recently on, which was in the pane that went', async () => {
    const editor = await splitWithBoth()

    dismissFromTheRibbon()
    await givenAsync(editor.settled())

    expect(bufferIn(0)).toBe('# other.md')
  })

  it('leaves one pane, because dismissing is not hiding', async () => {
    const editor = await splitWithBoth()

    dismissFromTheRibbon()
    await givenAsync(editor.settled())

    expect(root.querySelectorAll('[data-part="pane"]')).toHaveLength(1)
  })

  it('remembers nothing against the pane that went, so summoning it again gives a blank one', async () => {
    const editor = await splitWithBoth()

    dismissFromTheRibbon()
    await givenAsync(editor.settled())

    expect(readKeptTabs('secondary').tabs).toStrictEqual([])
  })
})

describe('dismissing the second pane while the reader is in the first', () => {
  it('keeps showing what the first pane was on, because that is where they were', async () => {
    const editor = await splitWithBoth()
    root.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowLeft', altKey: true, ctrlKey: true }),
    )

    dismissFromTheRibbon()
    await givenAsync(editor.settled())

    expect(bufferIn(0)).toBe('# notes.md')
  })
})

describe('dismissing a split that is not there', () => {
  it('leaves the one pane alone rather than failing', async () => {
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

    dismissFromTheRibbon()
    await givenAsync(editor.settled())

    expect(root.querySelectorAll('[data-part="pane"]')).toHaveLength(1)
  })
})
