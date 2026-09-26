'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport, TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

import { openEditor, page, recorded, sessionRecording, statusText, type Recorded } from './editor-fixtures.ts'

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

describe('which view the workspace shows', () => {
  function shown(): string[] {
    return [...root.querySelectorAll<HTMLElement>('#editor, [id^="view-"]')]
      .filter((view) => view.hidden === false)
      .map((view) => view.id)
  }

  it('shows the editor once the document has loaded', async () => {
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(shown()).toStrictEqual(['editor'])
  })

  it('reports a named document that is not there, rather than offering a blank one', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await bootstrap({ root, pathname: '/doc/journal/gone.md', session })

    expect(shown()).toStrictEqual(['view-missing'])
  })

  it('names the path that is missing', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await bootstrap({ root, pathname: '/doc/journal/gone.md', session })

    expect(root.querySelector('#missing-path')?.textContent).toBe('journal/gone.md')
  })

  it('opens a missing folder index as a new document, because browsing must not write', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '# new', stored: false }) })

    await openEditor({ root, pathname: '/doc/journal/', session })

    expect(shown()).toStrictEqual(['editor'])
  })

  it('returns no editor for a missing document, so nothing can autosave into it', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await expect(bootstrap({ root, pathname: '/doc/journal/gone.md', session })).resolves.toBeNull()
  })

  it('shows the unreachable view when the load fails outright', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrap({ root, pathname: '/doc/notes.md', session })

    expect(shown()).toStrictEqual(['view-unreachable'])
  })

  it('says why it could not be reached, so a reload is an informed choice', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrap({ root, pathname: '/doc/notes.md', session })

    expect(root.querySelector('#unreachable-reason')?.textContent).toContain('network down')
  })

  it('names the store rather than an empty path when the root cannot be loaded', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrap({ root, pathname: '/doc/', session })

    expect(root.querySelector('#unreachable-reason')?.textContent).toContain('The store')
  })

  it('survives markup with nowhere to write the reason', async () => {
    root.querySelector('#unreachable-reason')?.remove()
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await expect(bootstrap({ root, pathname: '/doc/notes.md', session })).resolves.toBeNull()
  })

  it('does not report an unreachable store as a failure to start', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrapOrReport({ root, pathname: '/doc/notes.md', session })

    expect(statusText(root)).not.toContain('Failed to start')
  })
})

describe('the page title', () => {
  it('names the open document', async () => {
    await openEditor({ root, pathname: '/doc/journal/a.md', session: fakeSession() })

    expect(document.title).toBe('journal/a.md')
  })

  it('names a folder by its own name, not by its index file', async () => {
    await openEditor({ root, pathname: '/doc/journal/2026/', session: fakeSession() })

    expect(document.title).toBe('journal/2026')
  })
})

describe('long lines', () => {
  it('are marked for wrapping rather than left to scroll sideways', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
  })
})
