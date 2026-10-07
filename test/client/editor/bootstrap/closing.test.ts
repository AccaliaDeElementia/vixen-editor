'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../../../../src/client/editor/session.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'
import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import { openEditor, page, recorded, sessionRecording, trackEditor, type Recorded } from '../../editor-fixtures.ts'
import { givenAsync } from '../../../conditions.ts'
import { dialogsDismissing, filesAnsweringEmpty } from '../../editor-fixtures.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(content: string): Session {
  return sessionRecording(record, { load: () => Promise.resolve({ content, stored: true }) })
}

function closerFor(tab: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-tab="${tab}"] .tabs__close`)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('closing the editor tab in the second pane', () => {
  it('leaves the first pane holding the document it was showing', async () => {
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
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    closerFor('editor:other.md')?.click()

    expect(editor.view.state.doc.toString()).toBe('# stored')
  })
})

describe('closing a document that is being previewed in the other pane', () => {
  it('takes the preview with it, because a preview of a closed document has nothing to show', async () => {
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
    root.querySelector<HTMLElement>('#preview-markup')?.click()

    closerFor('editor:notes.md')?.click()

    expect(root.querySelector('[data-tab="markup:notes.md"]')).toBeNull()
  })
})

describe('closing the last tab in the second pane', () => {
  it('dismisses the split, so the reader is not left with a pane they cannot get rid of', async () => {
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
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    closerFor('editor:other.md')?.click()

    expect(root.querySelector<HTMLElement>('[data-part="panes"]')?.dataset.split).toBeUndefined()
  })
})

describe('closing the last tab in the only pane', () => {
  it('puts the reader back at the document root, so a reload does not reopen what they closed', async () => {
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession('# stored') })

    closerFor('editor:notes.md')?.click()

    expect(window.location.pathname).toBe('/doc/')
  })
})
