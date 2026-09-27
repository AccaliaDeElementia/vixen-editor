'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

import { page, recorded, sessionRecording, type Recorded } from './editor-fixtures.ts'

const { bootstrap } = TestOnly

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('a link inside the document', () => {
  it('opens on Ctrl+click, resolved against the document holding it', async () => {
    const opened: string[] = []
    const session = fakeSession({ load: () => Promise.resolve({ content: 'see [a](a.md)', stored: true }) })
    const view = await bootstrap({
      root,
      pathname: '/doc/journal/notes.md',
      session,
      openUrl: (url: string) => {
        opened.push(url)
      },
    })

    view.contentDOM
      .querySelector('.cm-vixen-link')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))

    expect(opened).toStrictEqual(['/doc/journal/a.md'])
  })
})

describe('dropping an entry from the file browser', () => {
  function dropOn(view: { contentDOM: HTMLElement }, entries: Record<string, string>): void {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { getData: (type: string) => entries[type] ?? '' },
      configurable: true,
    })
    Object.defineProperty(event, 'clientX', { value: 0, configurable: true })
    Object.defineProperty(event, 'clientY', { value: 0, configurable: true })
    view.contentDOM.dispatchEvent(event)
  }

  it('inserts a link to the dropped document, relative to the one open', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await bootstrap({ root, pathname: '/doc/journal/notes.md', session })

    dropOn(view, {
      'application/x-vixen-path': 'journal/other.md',
      'application/x-vixen-kind': 'document',
    })

    expect(view.state.doc.toString()).toBe('[other.md](other.md)')
  })

  it('embeds a dropped image rather than linking it', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session })

    dropOn(view, { 'application/x-vixen-path': 'p.png', 'application/x-vixen-kind': 'image' })

    expect(view.state.doc.toString()).toBe('![p.png](p.png)')
  })

  it('leaves the caret after what it inserted, ready to keep typing', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session })

    dropOn(view, { 'application/x-vixen-path': 'a.md', 'application/x-vixen-kind': 'document' })

    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it('counts as an edit, so the autosave window restarts', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session })

    dropOn(view, { 'application/x-vixen-path': 'a.md', 'application/x-vixen-kind': 'document' })

    expect(root.querySelector('#save-label')?.textContent).toBe('Save pending')
  })
})
