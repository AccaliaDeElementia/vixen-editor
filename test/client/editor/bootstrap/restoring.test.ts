'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { writeKeptTabs } from '../../../../src/client/layout/kept-tabs.ts'
import { toggleSplit } from '../../../../src/client/layout/split.ts'
import { announceSplitChanged } from '../../../../src/client/split-changed.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'
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
const ONE_PANE = 1
const ONE_TAB = 1

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(content: string): Session {
  return sessionRecording(record, { load: () => Promise.resolve({ content, stored: true }) })
}

async function reopened(): Promise<{ settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname: '/doc/notes.md',
      session: fakeSession('# stored'),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')

  return editor
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

describe('a workspace that was split when the page was last open', () => {
  it('draws the second pane tab strip, so the tabs it held come back with it', async () => {
    writeKeptTabs('secondary', [{ path: 'other.md', view: 'editor' }], null)
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopened()
    await givenAsync(editor.settled())

    expect(tabsIn(1)).toStrictEqual(['editor:other.md'])
  })
})

describe('a second pane that kept the very document the url opens', () => {
  it('ends up with one editor for it, because one document has one editor however the tab got there', async () => {
    writeKeptTabs(
      'secondary',
      [
        { path: 'notes.md', view: 'editor' },
        { path: 'other.md', view: 'editor' },
      ],
      null,
    )
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    const editor = await reopened()
    await givenAsync(editor.settled())

    expect(root.querySelectorAll('[data-tab="editor:notes.md"]')).toHaveLength(ONE_TAB)
  })
})

describe('a split dismissed by the sidebar split button', () => {
  it('is forgotten, so the tabs that went with it are not resurrected later', async () => {
    const editor = await reopened()
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())
    toggleSplit(root, 'beside', WIDE_ENOUGH)
    announceSplitChanged(root)

    root.querySelector<HTMLElement>('[data-tab="editor:notes.md"] .tabs__close')?.click()

    expect(tabsIn(0)).toStrictEqual([])
  })
})

describe('a second pane summoned by the sidebar split button', () => {
  it('is wired up, so it can be given something to show', async () => {
    await reopened()

    toggleSplit(root, 'beside', WIDE_ENOUGH)
    announceSplitChanged(root)

    expect(root.querySelectorAll('[data-part="tabs"]')[1]?.querySelector('[role="tablist"]')).not.toBeNull()
  })
})

describe('a second pane that comes back holding nothing', () => {
  it('is dismissed, because a split with one empty side is a split the reader did not ask for', async () => {
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    await reopened()

    expect(root.querySelectorAll('[data-part="pane"]')).toHaveLength(ONE_PANE)
  })
})
