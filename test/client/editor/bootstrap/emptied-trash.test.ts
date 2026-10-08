'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import { writeKeptTabs } from '../../../../src/client/layout/kept-tabs.ts'
import { announceTrashEmptied } from '../../../../src/client/trash-emptied.ts'
import { toggleSplit } from '../../../../src/client/layout/split.ts'
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
const DELETED = { path: 'gone.md', view: 'deleted' } as const
const EDITING = { path: 'notes.md', view: 'editor' } as const

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

async function reopened(): Promise<{ settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname: '/doc/notes.md',
      session: sessionRecording(record, {
        load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
      }),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')
  await givenAsync(editor.settled())

  return editor
}

function tabs(): Array<string | undefined> {
  return [...root.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => tab.dataset.tab)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('a tab showing something that was in the trash', () => {
  it('closes when the trash is emptied, because what it shows is gone', async () => {
    writeKeptTabs('primary', [EDITING, DELETED], EDITING)
    const editor = await reopened()

    announceTrashEmptied(root)
    await editor.settled()

    expect(tabs()).toStrictEqual(['editor:notes.md'])
  })

  it('leaves the documents alone, which emptying the trash does not touch', async () => {
    writeKeptTabs('primary', [EDITING, DELETED], EDITING)
    const editor = await reopened()

    announceTrashEmptied(root)
    await editor.settled()

    expect(tabs()).toContain('editor:notes.md')
  })

  it('closes one in the other pane too, since the trash is not a pane’s own', async () => {
    writeKeptTabs('primary', [EDITING], EDITING)
    writeKeptTabs('secondary', [DELETED], DELETED)
    toggleSplit(root, 'beside', WIDE_ENOUGH)
    const editor = await reopened()

    announceTrashEmptied(root)
    await editor.settled()

    expect(tabs()).not.toContain('deleted:gone.md')
  })
})
