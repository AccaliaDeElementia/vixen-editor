'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/app/bootstrap.ts'
import type { Session } from '../../../../src/client/document/session.ts'
import { givenAsync } from '../../../conditions.ts'
import { toggleSplit } from '../../../../src/client/workspace/split/split.ts'
import { writeKeptTabs } from '../../../../src/client/workspace/tabs/kept-tabs.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  page,
  recorded,
  sessionRecording,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

const A_DOCUMENT = '# Notes\n\nwith prose\n'
const PREVIEW_OF_ASIDE = { path: 'aside.md', view: 'markup' } as const
const WIDE_ENOUGH = 1200

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let saved: File[] = []

function fakeSession(): Session {
  return sessionRecording(record, {
    load: (id: string) => Promise.resolve({ content: id === 'folder/notes.md' ? A_DOCUMENT : `# ${id}`, stored: true }),
  })
}

async function editing(): Promise<{ settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname: '/doc/folder/notes.md',
      session: fakeSession(),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
      saveFile: (file: File) => {
        saved.push(file)
      },
    }),
  )
  if (editor === null) throw new Error('the editor did not start')

  return editor
}

function pressSaveIn(pane = 0): void {
  const { [pane]: button } = root.querySelectorAll<HTMLElement>('[data-part="save-html"]')

  button?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button?.click()
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  saved = []
  document.body.innerHTML = ''
  root = page()
})

describe('saving a copy of the document as html', () => {
  it('names the file for the document the reader is in', async () => {
    const editor = await editing()
    await givenAsync(editor.settled())

    pressSaveIn()

    expect(saved.map((file) => file.name)).toStrictEqual(['notes.html'])
  })

  it('carries the document as it renders, rather than as it was written', async () => {
    const editor = await editing()
    await givenAsync(editor.settled())

    pressSaveIn()

    await expect(saved[0]?.text()).resolves.toContain('<h1>Notes</h1>')
  })

  it('saves what the reader is looking at, even where the pane holds another document behind it', async () => {
    writeKeptTabs('secondary', [PREVIEW_OF_ASIDE], PREVIEW_OF_ASIDE)
    toggleSplit(root, 'beside', WIDE_ENOUGH)
    const editor = await editing()
    await givenAsync(editor.settled())

    pressSaveIn(1)

    expect(saved.map((file) => file.name)).toStrictEqual(['aside.html'])
  })

  it('saves nothing at all once the reader has closed the last tab', async () => {
    const editor = await editing()
    await givenAsync(editor.settled())
    root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'w', altKey: true }))
    await givenAsync(editor.settled())

    pressSaveIn()

    expect(saved).toStrictEqual([])
  })
})
